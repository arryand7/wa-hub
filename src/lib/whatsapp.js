const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');

const SESSION_DIR = path.resolve(
  process.env.WA_SESSION_DIR || path.join(__dirname, '..', '..', 'wa-sessions')
);

let sock = null;
let qrString = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected
let io = null; // Socket.IO reference

function setIO(socketIO) {
  io = socketIO;
}

function getStatus() {
  return connectionStatus;
}

function getSocket() {
  return sock;
}

function getQR() {
  return qrString;
}

async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    // QR is delivered to the authenticated dashboard; keep pairing secrets out of logs.
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  });

  // ─── Connection update events ───
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrString = qr;
      connectionStatus = 'connecting';
      // Generate QR as data URL and emit to dashboard
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        if (io) {
          io.emit('wa:qr', { qr: qrDataUrl });
          io.emit('wa:status', { status: 'connecting' });
        }
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }

    if (connection === 'close') {
      qrString = null;
      connectionStatus = 'disconnected';
      if (io) io.emit('wa:status', { status: 'disconnected' });

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️  WA disconnected. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => connectWA(), 3000);
      } else {
        console.log('🚫 WA logged out. Delete wa-sessions folder to re-login.');
      }
    }

    if (connection === 'open') {
      qrString = null;
      connectionStatus = 'connected';
      console.log('✅ WhatsApp connected!');
      if (io) {
        io.emit('wa:status', { status: 'connected' });
        io.emit('wa:qr', { qr: null });
      }
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  return sock;
}

// ─── Send text message ───
async function sendMessage(jid, text) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp belum terhubung');
  }
  const result = await sock.sendMessage(jid, { text });
  return result;
}

// ─── Fetch all groups ───
async function fetchGroups() {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp belum terhubung');
  }
  const groups = await sock.groupFetchAllParticipating();
  // Convert to array of { jid, name }
  return Object.values(groups).map((g) => ({
    jid: g.id,
    name: g.subject || g.id,
  }));
}

// ─── Disconnect / Logout ───
async function disconnectWA() {
  if (sock) {
    await sock.logout();
    sock = null;
    connectionStatus = 'disconnected';
    qrString = null;
    if (io) io.emit('wa:status', { status: 'disconnected' });
  }
}

module.exports = {
  connectWA,
  sendMessage,
  fetchGroups,
  disconnectWA,
  getStatus,
  getSocket,
  getQR,
  setIO,
};
