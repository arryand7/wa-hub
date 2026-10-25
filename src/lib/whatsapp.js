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
const fs = require('fs');

const SESSION_DIR = path.resolve(
  process.env.WA_SESSION_DIR || path.join(__dirname, '..', '..', 'wa-sessions')
);

let sock = null;
let qrString = null;
let qrDataUrlCache = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected
let accountInfo = null; // { phone, name, jid }
let io = null; // Socket.IO reference
let cachedVersion = null;
let isInitializing = false;
let reconnectTimer = null;
const messageUpsertHandlers = [];

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

function getQRDataUrl() {
  return qrDataUrlCache;
}

function getAccountInfo() {
  return accountInfo;
}

function onMessageUpsert(handler) {
  if (typeof handler === 'function') {
    messageUpsertHandlers.push(handler);
  }
}

function clearSessionDir() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log('🧹 Direktori sesi WA berhasil dibersihkan:', SESSION_DIR);
    return true;
  } catch (err) {
    console.error('❌ Gagal membersihkan direktori sesi WA:', err.message);
    return false;
  }
}

async function getBaileysVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    cachedVersion = version;
    console.log(`📱 Baileys version: ${version.join('.')}, isLatest: ${isLatest}`);
    return version;
  } catch (err) {
    console.warn('⚠️ Gagal mengambil versi Baileys terbaru, menggunakan versi fallback:', err.message);
    cachedVersion = [2, 3000, 1015901307];
    return cachedVersion;
  }
}

async function closeSocket(shouldLogout = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (sock) {
    const currentSock = sock;
    currentSock._isClosingManually = true;
    sock = null;

    if (shouldLogout && connectionStatus === 'connected') {
      try {
        await Promise.race([
          currentSock.logout('User initiated logout'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timeout')), 3000)),
        ]);
      } catch (err) {
        console.warn('⚠️ Error during socket logout (non-fatal):', err.message);
      }
    }

    try {
      currentSock.end(new Error('Socket closed'));
    } catch (err) {
      // ignore
    }
  }

  qrString = null;
  qrDataUrlCache = null;
}

function scheduleReconnect(delay = 3000, clearSession = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectWA(clearSession);
    } catch (err) {
      console.error('❌ Reconnect attempt failed:', err.message);
    }
  }, delay);
}

async function connectWA(forceCleanSession = false) {
  if (isInitializing) {
    console.log('⏳ Inisialisasi WhatsApp sedang berjalan, menunggu...');
    return sock;
  }

  isInitializing = true;
  connectionStatus = 'connecting';
  qrString = null;
  qrDataUrlCache = null;

  if (io) {
    io.emit('wa:status', { status: 'connecting' });
    io.emit('wa:qr', { qr: null });
  }

  try {
    if (sock) {
      await closeSocket(false);
    }

    if (forceCleanSession) {
      clearSessionDir();
    } else if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const version = await getBaileysVersion();
    const logger = pino({ level: 'silent' });

    const newSock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      // QR is delivered to the authenticated dashboard; keep pairing secrets out of logs.
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });
    sock = newSock;

    // Register message upsert handlers
    newSock.ev.on('messages.upsert', async (data) => {
      for (const handler of messageUpsertHandlers) {
        try {
          await handler(data);
        } catch (err) {
          console.error('❌ Error handling message upsert:', err);
        }
      }
    });

    // ─── Connection update events ───
    newSock.ev.on('connection.update', async (update) => {
      // Ignore events if this socket was manually closed or replaced
      if (newSock._isClosingManually || sock !== newSock) {
        return;
      }

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrString = qr;
        connectionStatus = 'connecting';
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          qrDataUrlCache = qrDataUrl;
          if (io) {
            io.emit('wa:qr', { qr: qrDataUrl });
            io.emit('wa:status', { status: 'connecting' });
          }
          console.log('📱 QR Code baru siap untuk discan');
        } catch (err) {
          console.error('QR generation error:', err);
        }
      }

      if (connection === 'close') {
        qrString = null;
        qrDataUrlCache = null;
        connectionStatus = 'disconnected';
        accountInfo = null;

        if (io) {
          io.emit('wa:status', { status: 'disconnected' });
          io.emit('wa:qr', { qr: null });
          io.emit('wa:account', null);
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut =
          statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession;

        console.log(`⚠️ WA disconnected. Code: ${statusCode}. LoggedOut: ${isLoggedOut}`);

        if (isLoggedOut) {
          console.log('🚫 WA logged out atau sesi kadaluarsa. Membersihkan sesi & menyiapkan QR baru...');
          clearSessionDir();
          // Auto-reconnect quickly so a fresh QR is ready for the new WA account!
          scheduleReconnect(1500, true);
        } else {
          console.log('🔄 Reconnecting WA dalam 3 detik...');
          scheduleReconnect(3000, false);
        }
      }

      if (connection === 'open') {
        qrString = null;
        qrDataUrlCache = null;
        connectionStatus = 'connected';

        const jid = newSock?.user?.id || '';
        const phone = jid.split(':')[0].split('@')[0] || '';
        const name = newSock?.user?.name || newSock?.user?.notify || '';
        accountInfo = { jid, phone, name };

        console.log(`✅ WhatsApp terhubung sebagai: ${phone} (${name || 'Admin'})`);

        if (io) {
          io.emit('wa:status', { status: 'connected' });
          io.emit('wa:account', accountInfo);
          io.emit('wa:qr', { qr: null });
        }
      }
    });

    // Save credentials on update
    newSock.ev.on('creds.update', saveCreds);

    return newSock;
  } catch (err) {
    console.error('❌ Failed to connect WA:', err);
    connectionStatus = 'disconnected';
    if (io) io.emit('wa:status', { status: 'disconnected' });
    throw err;
  } finally {
    isInitializing = false;
  }
}

// ─── Manual Logout / Putuskan Akun ───
async function logoutWA() {
  console.log('🚪 Memutuskan akun WhatsApp dan membersihkan sesi...');
  await closeSocket(true);
  clearSessionDir();
  accountInfo = null;
  connectionStatus = 'connecting';

  if (io) {
    io.emit('wa:status', { status: 'connecting' });
    io.emit('wa:account', null);
    io.emit('wa:qr', { qr: null });
  }

  // Segera mulai koneksi baru agar QR code langsung keluar
  return await connectWA(true);
}

// ─── Manual Refresh / Restart QR ───
async function restartWA(clearSession = false) {
  console.log(`🔄 Restarting WhatsApp connection (clearSession: ${clearSession})...`);
  await closeSocket(false);
  if (clearSession) {
    clearSessionDir();
    accountInfo = null;
  }
  connectionStatus = 'connecting';

  if (io) {
    io.emit('wa:status', { status: 'connecting' });
    io.emit('wa:qr', { qr: null });
  }

  return await connectWA(clearSession);
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
  return Object.values(groups).map((g) => ({
    jid: g.id,
    name: g.subject || g.id,
  }));
}

module.exports = {
  connectWA,
  logoutWA,
  restartWA,
  disconnectWA: logoutWA,
  sendMessage,
  fetchGroups,
  getStatus,
  getSocket,
  getQR,
  getQRDataUrl,
  getAccountInfo,
  onMessageUpsert,
  setIO,
  clearSessionDir,
};
