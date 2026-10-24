const axios = require('axios');
const prisma = require('./prisma');
const wa = require('./whatsapp');

// ─── Handle incoming WA message ───────────────────────────────
async function handleMessage(msg) {
  try {
    // Extract text from message
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    if (!text || !text.startsWith('/')) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');

    // Parse command and arguments
    const parts = text.trim().split(/\s+/);
    const trigger = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Find matching command
    const command = await prisma.command.findUnique({
      where: { triggerCommand: trigger },
      include: {
        app: true,
        commandGroups: { include: { waGroup: true } },
      },
    });

    if (!command || !command.isActive || !command.app.isActive) return;

    // Check group access
    let registeredGroup = null;
    if (isGroup) {
      // Security check: Only groups registered in WA Hub are allowed to interact with the bot!
      registeredGroup = await prisma.waGroup.findUnique({
        where: { jid: remoteJid },
      });

      if (!registeredGroup) {
        console.log(`🔒 Perintah "${trigger}" diabaikan: Grup "${remoteJid}" tidak terdaftar di WA Hub`);
        return;
      }

      // If command is restricted to specific groups, verify membership
      if (!command.allGroups) {
        const allowedJids = command.commandGroups.map((cg) => cg.waGroup.jid);
        if (!allowedJids.includes(remoteJid)) {
          console.log(`🔒 Perintah "${trigger}" diabaikan: Grup "${registeredGroup.name}" tidak diizinkan untuk perintah ini`);
          return;
        }
      }
    }

    // Map arguments to API parameters
    const params = {};
    if (command.argMapping) {
      const mappings = JSON.parse(command.argMapping);
      for (const mapping of mappings) {
        const argIndex = (mapping.position || 1) - 1;
        if (args[argIndex] !== undefined) {
          params[mapping.paramName] = args[argIndex];
        }
      }
    }

    let status = 'success';
    let responseBody = null;
    let errorMessage = null;
    let replyText = '';

    try {
      // Call external app API
      const apiUrl = `${command.app.baseUrl}/api/bot/${command.actionId}`;
      const apiResponse = await axios.post(apiUrl, params, {
        headers: { 'X-Bot-Secret-Key': command.app.secretKey },
        timeout: 15000,
      });

      responseBody = JSON.stringify(apiResponse.data);

      // Replace template variables
      replyText = command.messageTemplate;
      const data = apiResponse.data?.data || apiResponse.data;

      if (data && typeof data === 'object') {
        // Handle array data
        if (Array.isArray(data)) {
          replyText = replyText.replace(/{{\s*data\s*}}/g, JSON.stringify(data, null, 2));
        } else {
          for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            replyText = replyText.replace(regex, String(value ?? '-'));
          }
        }
      }

      // Handle args replacement (e.g., {{args.1}})
      for (let i = 0; i < args.length; i++) {
        const regex = new RegExp(`{{\\s*args\\.${i + 1}\\s*}}`, 'g');
        replyText = replyText.replace(regex, args[i]);
      }

      // Remove unreplaced variables
      replyText = replyText.replace(/{{\s*[\w.]+\s*}}/g, '-');
    } catch (err) {
      status = 'error';
      errorMessage = err.message;
      replyText = `⚠️ Gagal memproses perintah *${trigger}*\nError: ${err.message}`;
    }

    // Send reply
    await wa.sendMessage(remoteJid, replyText);

    // Resolve group name
    const groupName = isGroup ? (registeredGroup?.name || remoteJid) : null;

    // Log message
    await prisma.messageLog.create({
      data: {
        direction: 'incoming',
        waJid: remoteJid,
        groupName,
        commandTrigger: trigger,
        requestBody: JSON.stringify({ args, params }),
        responseBody,
        status,
        errorMessage,
        commandId: command.id,
      },
    });
  } catch (err) {
    console.error('❌ Command engine error:', err);
  }
}

module.exports = { handleMessage };
