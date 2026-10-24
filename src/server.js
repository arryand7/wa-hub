const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const wa = require('./lib/whatsapp');
const scheduler = require('./lib/scheduler');
const commandEngine = require('./lib/commandEngine');

const server = http.createServer(app);
const io = new Server(server);

// ─── Socket.IO for real-time QR & status ──────────────────────
wa.setIO(io);

io.on('connection', (socket) => {
  // Send current status on connect
  socket.emit('wa:status', { status: wa.getStatus() });

  // If there's a pending QR, send it
  const QRCode = require('qrcode');
  const currentQR = wa.getQR();
  if (currentQR) {
    QRCode.toDataURL(currentQR, { width: 300, margin: 2 }).then((qrDataUrl) => {
      socket.emit('wa:qr', { qr: qrDataUrl });
    });
  }
});

// ─── Start WhatsApp ───────────────────────────────────────────
async function startWhatsApp() {
  try {
    const sock = await wa.connectWA();

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue; // Skip own messages
        await commandEngine.handleMessage(msg);
      }
    });

    console.log('📱 WhatsApp client initialized');
  } catch (err) {
    console.error('❌ WhatsApp init error:', err);
  }
}

// ─── Start Server ─────────────────────────────────────────────
async function start() {
  try {
    // Start server
    server.listen(config.PORT, () => {
      console.log(`\n🚀 WA Hub Sabira running on http://localhost:${config.PORT}`);
      console.log(`   Environment: ${config.NODE_ENV}`);
      console.log(`   Timezone: ${config.TIMEZONE}\n`);
    });

    // Start WhatsApp connection
    await startWhatsApp();

    // Load scheduled jobs
    await scheduler.loadAllSchedules();
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

start();
