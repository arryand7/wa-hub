const express = require('express');
const wa = require('../lib/whatsapp');

const router = express.Router();

function isAjaxRequest(req) {
  return (
    req.xhr ||
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    req.headers['accept']?.includes('application/json') ||
    req.headers['content-type']?.includes('application/json')
  );
}

// POST /wa/logout — Disconnect WA, clean session, immediately prepare new QR
router.post('/logout', async (req, res) => {
  try {
    await wa.logoutWA();
    if (isAjaxRequest(req)) {
      return res.json({
        success: true,
        message: 'WhatsApp berhasil logout. Sesi dibersihkan & QR Code baru sedang dimuat...',
      });
    }
    req.flash('success', 'WhatsApp berhasil logout. Silakan scan QR Code baru.');
    return res.redirect('/');
  } catch (err) {
    console.error('Logout WA error:', err);
    if (isAjaxRequest(req)) {
      return res.status(500).json({
        success: false,
        message: `Gagal logout: ${err.message}`,
      });
    }
    req.flash('error', `Gagal logout: ${err.message}`);
    return res.redirect('/');
  }
});

// POST /wa/refresh — Fast refresh QR / restart connection
router.post('/refresh', async (req, res) => {
  try {
    const isConnected = wa.getStatus() === 'connected';
    // If not connected, clear stale credentials to force fresh pairing QR
    await wa.restartWA(!isConnected);

    if (isAjaxRequest(req)) {
      return res.json({
        success: true,
        message: 'Koneksi WhatsApp dimuat ulang. QR Code baru sedang disiapkan...',
      });
    }
    req.flash('success', 'Koneksi WhatsApp dimuat ulang.');
    return res.redirect('/');
  } catch (err) {
    console.error('Refresh WA error:', err);
    if (isAjaxRequest(req)) {
      return res.status(500).json({
        success: false,
        message: `Gagal memuat ulang: ${err.message}`,
      });
    }
    req.flash('error', `Gagal memuat ulang: ${err.message}`);
    return res.redirect('/');
  }
});

// POST /wa/reset — Force reset session files and restart
router.post('/reset', async (req, res) => {
  try {
    await wa.restartWA(true);
    if (isAjaxRequest(req)) {
      return res.json({
        success: true,
        message: 'Sesi WhatsApp berhasil direset. Silakan scan QR Code baru.',
      });
    }
    req.flash('success', 'Sesi WhatsApp berhasil direset. Silakan scan QR Code baru.');
    return res.redirect('/');
  } catch (err) {
    console.error('Reset WA error:', err);
    if (isAjaxRequest(req)) {
      return res.status(500).json({
        success: false,
        message: `Gagal mereset sesi: ${err.message}`,
      });
    }
    req.flash('error', `Gagal mereset sesi: ${err.message}`);
    return res.redirect('/');
  }
});

// GET /wa/status — Check real-time WA connection status via JSON
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: wa.getStatus(),
      account: wa.getAccountInfo(),
      hasQR: Boolean(wa.getQRDataUrl() || wa.getQR()),
    },
  });
});

module.exports = router;
