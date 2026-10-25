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

io.on('connection', async (socket) => {
  // Send current status & account on connect
  socket.emit('wa:status', { status: wa.getStatus() });
  socket.emit('wa:account', wa.getAccountInfo());

  // If there's a pending QR, send it immediately
  const qrDataUrl = wa.getQRDataUrl();
  if (qrDataUrl) {
    socket.emit('wa:qr', { qr: qrDataUrl });
  }
});

// ─── Listen for incoming WhatsApp messages ────────────────────
wa.onMessageUpsert(async ({ messages }) => {
  for (const msg of messages) {
    if (msg.key.fromMe) continue; // Skip own messages
    await commandEngine.handleMessage(msg);
  }
});

// ─── Start WhatsApp ───────────────────────────────────────────
async function startWhatsApp() {
  try {
    await wa.connectWA();
    console.log('📱 WhatsApp client initialized');
  } catch (err) {
    console.error('❌ WhatsApp init error:', err);
  }
}

// ─── Start Server ─────────────────────────────────────────────
async function start() {
  try {
    // Start server
    server.listen(config.PORT, config.HOST, () => {
      console.log(`\n🚀 WA Hub Sabira running on http://${config.HOST}:${config.PORT}`);
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
