const express = require('express');
const prisma = require('../lib/prisma');
const wa = require('../lib/whatsapp');

const router = express.Router();

// GET /groups — List all WA groups
router.get('/', async (req, res) => {
  const groups = await prisma.waGroup.findMany({ orderBy: { name: 'asc' } });
  res.render('groups/index', { title: 'Grup WhatsApp', groups, currentPage: 'groups' });
});

// POST /groups/sync — Sync groups from WA
router.post('/sync', async (req, res) => {
  try {
    const waGroups = await wa.fetchGroups();

    let synced = 0;
    for (const group of waGroups) {
      await prisma.waGroup.upsert({
        where: { jid: group.jid },
        update: { name: group.name, syncedAt: new Date() },
        create: { jid: group.jid, name: group.name },
      });
      synced++;
    }

    req.flash('success', `${synced} grup berhasil disinkronkan`);
  } catch (err) {
    console.error('Sync groups error:', err);
    req.flash('error', `Gagal sync grup: ${err.message}`);
  }
  res.redirect('/groups');
});

// POST /groups/:id/delete — Remove group from DB
router.post('/:id/delete', async (req, res) => {
  try {
    await prisma.waGroup.delete({ where: { id: parseInt(req.params.id) } });
    req.flash('success', 'Grup berhasil dihapus dari daftar');
  } catch (err) {
    req.flash('error', 'Gagal menghapus grup');
  }
  res.redirect('/groups');
});

module.exports = router;
