const express = require('express');
const prisma = require('../lib/prisma');
const scheduler = require('../lib/scheduler');

const router = express.Router();

// GET /schedules — List all schedules
router.get('/', async (req, res) => {
  const schedules = await prisma.schedule.findMany({
    include: {
      command: { include: { app: true } },
      targetGroup: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.render('schedules/index', { title: 'Jadwal Otomatis', schedules, currentPage: 'schedules' });
});

// GET /schedules/create — Form create
router.get('/create', async (req, res) => {
  const commands = await prisma.command.findMany({
    where: { isActive: true },
    include: { app: true },
    orderBy: { triggerCommand: 'asc' },
  });
  const groups = await prisma.waGroup.findMany({ orderBy: { name: 'asc' } });
  res.render('schedules/form', {
    title: 'Tambah Jadwal',
    schedule: null,
    commands,
    groups,
    currentPage: 'schedules',
  });
});

// POST /schedules — Store
router.post('/', async (req, res) => {
  const { command_id, cron_expression, target_group_id, extra_params, is_active } = req.body;

  try {
    const schedule = await prisma.schedule.create({
      data: {
        commandId: parseInt(command_id),
        cronExpression: cron_expression,
        targetGroupId: parseInt(target_group_id),
        extraParams: extra_params || null,
        isActive: is_active === 'on',
      },
      include: {
        command: { include: { app: true } },
        targetGroup: true,
      },
    });

    // Register cron job immediately
    scheduler.registerJob(schedule);

    req.flash('success', 'Jadwal berhasil dibuat');
  } catch (err) {
    console.error('Create schedule error:', err);
    req.flash('error', 'Gagal membuat jadwal');
  }
  res.redirect('/schedules');
});

// GET /schedules/:id/edit — Form edit
router.get('/:id/edit', async (req, res) => {
  const schedule = await prisma.schedule.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { command: true, targetGroup: true },
  });
  if (!schedule) {
    req.flash('error', 'Jadwal tidak ditemukan');
    return res.redirect('/schedules');
  }

  const commands = await prisma.command.findMany({
    where: { isActive: true },
    include: { app: true },
    orderBy: { triggerCommand: 'asc' },
  });
  const groups = await prisma.waGroup.findMany({ orderBy: { name: 'asc' } });
  res.render('schedules/form', {
    title: 'Edit Jadwal',
    schedule,
    commands,
    groups,
    currentPage: 'schedules',
  });
});

// POST /schedules/:id — Update
router.post('/:id', async (req, res) => {
  const { command_id, cron_expression, target_group_id, extra_params, is_active } = req.body;
  const id = parseInt(req.params.id);

  try {
    await prisma.schedule.update({
      where: { id },
      data: {
        commandId: parseInt(command_id),
        cronExpression: cron_expression,
        targetGroupId: parseInt(target_group_id),
        extraParams: extra_params || null,
        isActive: is_active === 'on',
      },
    });

    // Reload this specific cron job
    await scheduler.reloadSchedule(id);

    req.flash('success', 'Jadwal berhasil diperbarui');
  } catch (err) {
    console.error('Update schedule error:', err);
    req.flash('error', 'Gagal memperbarui jadwal');
  }
  res.redirect('/schedules');
});

// POST /schedules/:id/delete — Delete
router.post('/:id/delete', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    scheduler.unregisterJob(id);
    await prisma.schedule.delete({ where: { id } });
    req.flash('success', 'Jadwal berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Gagal menghapus jadwal');
  }
  res.redirect('/schedules');
});

// POST /schedules/:id/test — Test send now
router.post('/:id/test', async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        command: { include: { app: true } },
        targetGroup: true,
      },
    });

    if (!schedule) {
      req.flash('error', 'Jadwal tidak ditemukan');
      return res.redirect('/schedules');
    }

    await scheduler.executeSchedule(schedule);
    req.flash('success', 'Test kirim berhasil! Cek log untuk detailnya.');
  } catch (err) {
    console.error('Test schedule error:', err);
    req.flash('error', `Test gagal: ${err.message}`);
  }
  res.redirect('/schedules');
});

// POST /schedules/:id/toggle — Toggle active/inactive
router.post('/:id/toggle', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const schedule = await prisma.schedule.findUnique({ where: { id } });
    const newStatus = !schedule.isActive;

    await prisma.schedule.update({
      where: { id },
      data: { isActive: newStatus },
    });

    await scheduler.reloadSchedule(id);
    req.flash('success', `Jadwal ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`);
  } catch (err) {
    req.flash('error', 'Gagal mengubah status jadwal');
  }
  res.redirect('/schedules');
});

module.exports = router;
