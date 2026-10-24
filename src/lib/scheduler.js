const cron = require('node-cron');
const axios = require('axios');
const prisma = require('./prisma');
const wa = require('./whatsapp');
const config = require('../config');

// In-memory map of active cron jobs
const activeJobs = new Map(); // scheduleId → cronTask

// ─── Execute a scheduled command ──────────────────────────────
async function executeSchedule(schedule) {
  const { command, targetGroup } = schedule;
  const app = command.app || (await prisma.app.findUnique({ where: { id: command.appId } }));

  let status = 'success';
  let responseBody = null;
  let errorMessage = null;

  try {
    // Build params from extra_params
    const params = schedule.extraParams ? JSON.parse(schedule.extraParams) : {};

    // Call the external app API
    const apiUrl = `${app.baseUrl}/api/bot/${command.actionId}`;
    const apiResponse = await axios.post(apiUrl, params, {
      headers: { 'X-Bot-Secret-Key': app.secretKey },
      timeout: 15000,
    });

    responseBody = JSON.stringify(apiResponse.data);

    // Replace template variables
    let message = command.messageTemplate;
    if (apiResponse.data && typeof apiResponse.data === 'object') {
      const data = apiResponse.data.data || apiResponse.data;
      for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        message = message.replace(regex, String(value ?? '-'));
      }
    }
    // Remove any unreplaced variables
    message = message.replace(/{{\s*\w+\s*}}/g, '-');

    // Send to WA group
    await wa.sendMessage(targetGroup.jid, message);

    // Update last_run_at
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date() },
    });
  } catch (err) {
    status = 'error';
    errorMessage = err.message;
    console.error(`❌ Schedule ${schedule.id} error:`, err.message);
  }

  // Log
  await prisma.messageLog.create({
    data: {
      direction: 'scheduled',
      waJid: targetGroup.jid,
      groupName: targetGroup.name,
      commandTrigger: command.triggerCommand,
      requestBody: JSON.stringify({ scheduleId: schedule.id, actionId: command.actionId }),
      responseBody,
      status,
      errorMessage,
      scheduleId: schedule.id,
      commandId: command.id,
    },
  });
}

// ─── Register a single schedule ───────────────────────────────
function registerJob(schedule) {
  // Remove existing if any
  unregisterJob(schedule.id);

  if (!schedule.isActive) return;

  if (!cron.validate(schedule.cronExpression)) {
    console.error(`❌ Invalid cron for schedule ${schedule.id}: ${schedule.cronExpression}`);
    return;
  }

  const task = cron.schedule(
    schedule.cronExpression,
    async () => {
      console.log(`⏰ Running schedule #${schedule.id}: ${schedule.command?.triggerCommand}`);
      await executeSchedule(schedule);
    },
    { timezone: config.TIMEZONE }
  );

  activeJobs.set(schedule.id, task);
  console.log(`📅 Registered schedule #${schedule.id} [${schedule.cronExpression}]`);
}

// ─── Unregister a single schedule ─────────────────────────────
function unregisterJob(scheduleId) {
  const existing = activeJobs.get(scheduleId);
  if (existing) {
    existing.stop();
    activeJobs.delete(scheduleId);
  }
}

// ─── Load all active schedules from DB ────────────────────────
async function loadAllSchedules() {
  const schedules = await prisma.schedule.findMany({
    where: { isActive: true },
    include: {
      command: { include: { app: true } },
      targetGroup: true,
    },
  });

  // Stop all existing
  for (const [id, task] of activeJobs) {
    task.stop();
  }
  activeJobs.clear();

  // Register fresh
  for (const schedule of schedules) {
    registerJob(schedule);
  }

  console.log(`📅 Loaded ${schedules.length} active schedule(s)`);
}

// ─── Reload a single schedule (after create/update) ───────────
async function reloadSchedule(scheduleId) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      command: { include: { app: true } },
      targetGroup: true,
    },
  });

  if (!schedule) {
    unregisterJob(scheduleId);
    return;
  }

  registerJob(schedule);
}

module.exports = {
  loadAllSchedules,
  reloadSchedule,
  registerJob,
  unregisterJob,
  executeSchedule,
  activeJobs,
};
