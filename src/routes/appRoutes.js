const express = require('express');
const axios = require('axios');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /apps — List all apps
router.get('/', async (req, res) => {
  const apps = await prisma.app.findMany({ orderBy: { createdAt: 'desc' } });
  res.render('apps/index', { title: 'Aplikasi', apps, currentPage: 'apps' });
});

// GET /apps/create — Form create
router.get('/create', (req, res) => {
  res.render('apps/form', { title: 'Tambah Aplikasi', app: null, currentPage: 'apps' });
});

// POST /apps — Store
router.post('/', async (req, res) => {
  const { name, slug, base_url, secret_key } = req.body;
  try {
    await prisma.app.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        baseUrl: base_url,
        secretKey: secret_key,
      },
    });
    req.flash('success', `Aplikasi "${name}" berhasil ditambahkan`);
  } catch (err) {
    console.error('Create app error:', err);
    req.flash('error', err.code === 'P2002' ? 'Slug sudah digunakan' : 'Gagal menambahkan aplikasi');
  }
  res.redirect('/apps');
});

// GET /apps/:id/edit — Form edit
router.get('/:id/edit', async (req, res) => {
  const app = await prisma.app.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!app) {
    req.flash('error', 'Aplikasi tidak ditemukan');
    return res.redirect('/apps');
  }
  res.render('apps/form', { title: 'Edit Aplikasi', app, currentPage: 'apps' });
});

// POST /apps/:id — Update
router.post('/:id', async (req, res) => {
  const { name, slug, base_url, secret_key, is_active } = req.body;
  try {
    await prisma.app.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        baseUrl: base_url,
        secretKey: secret_key,
        isActive: is_active === 'on',
      },
    });
    req.flash('success', 'Aplikasi berhasil diperbarui');
  } catch (err) {
    console.error('Update app error:', err);
    req.flash('error', 'Gagal memperbarui aplikasi');
  }
  res.redirect('/apps');
});

// POST /apps/:id/delete — Delete
router.post('/:id/delete', async (req, res) => {
  try {
    await prisma.app.delete({ where: { id: parseInt(req.params.id) } });
    req.flash('success', 'Aplikasi berhasil dihapus');
  } catch (err) {
    console.error('Delete app error:', err);
    req.flash('error', 'Gagal menghapus aplikasi');
  }
  res.redirect('/apps');
});

// POST /apps/:id/sync-manifest — Sync manifest from external app
router.post('/:id/sync-manifest', async (req, res) => {
  try {
    const app = await prisma.app.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!app) {
      req.flash('error', 'Aplikasi tidak ditemukan');
      return res.redirect('/apps');
    }

    const response = await axios.get(`${app.baseUrl}/api/bot/manifest`, {
      headers: { 'X-Bot-Secret-Key': app.secretKey },
      timeout: 10000,
    });

    await prisma.app.update({
      where: { id: app.id },
      data: {
        manifestJson: JSON.stringify(response.data),
        lastSyncedAt: new Date(),
      },
    });

    req.flash('success', `Manifest "${app.name}" berhasil disinkronkan`);
  } catch (err) {
    console.error('Sync manifest error:', err);
    req.flash('error', `Gagal sync manifest: ${err.message}`);
  }
  res.redirect('/apps');
});

// GET /apps/:id/manifest — View manifest JSON (AJAX)
router.get('/:id/manifest', async (req, res) => {
  const app = await prisma.app.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!app || !app.manifestJson) {
    return res.json({ actions: [], variables: [] });
  }
  res.json(JSON.parse(app.manifestJson));
});

module.exports = router;
