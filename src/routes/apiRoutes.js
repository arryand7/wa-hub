const express = require('express');
const prisma = require('../lib/prisma');
const wa = require('../lib/whatsapp');
const { requireApiKey } = require('../middleware/apiKey');

const router = express.Router();

// POST /api/v1/send-message — Gateway outbox
router.post('/send-message', requireApiKey, async (req, res) => {
  const { to, message, type } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      message: 'Parameter "to" dan "message" wajib diisi',
    });
  }

  try {
    // Format JID if needed
    let jid = to;
    if (!jid.includes('@')) {
      // If it's a phone number, add @s.whatsapp.net
      // If it looks like a group ID, add @g.us
      jid = type === 'group' ? `${to}@g.us` : `${to}@s.whatsapp.net`;
    }

    const result = await wa.sendMessage(jid, message);

    // Resolve group name
    let groupName = null;
    if (jid.endsWith('@g.us')) {
      const group = await prisma.waGroup.findUnique({ where: { jid } });
      groupName = group?.name || jid;
    }

    // Log
    await prisma.messageLog.create({
      data: {
        direction: 'gateway',
        waJid: jid,
        groupName,
        requestBody: JSON.stringify(req.body),
        responseBody: JSON.stringify({ messageId: result?.key?.id }),
        status: 'success',
      },
    });

    return res.json({
      success: true,
      message: 'Pesan berhasil dikirim',
      data: { messageId: result?.key?.id },
    });
  } catch (err) {
    // Log error
    await prisma.messageLog.create({
      data: {
        direction: 'gateway',
        waJid: to,
        requestBody: JSON.stringify(req.body),
        status: 'error',
        errorMessage: err.message,
      },
    });

    return res.status(500).json({
      success: false,
      message: `Gagal mengirim pesan: ${err.message}`,
    });
  }
});

// GET /api/v1/status — WA connection status
router.get('/status', requireApiKey, (req, res) => {
  res.json({
    success: true,
    data: { status: wa.getStatus() },
  });
});

module.exports = router;
