const express = require('express');
const prisma = require('../lib/prisma');
const wa = require('../lib/whatsapp');

const router = express.Router();

// GET /groups — List all WA groups
router.get('/', async (req, res) => {
  const groups = await prisma.waGroup.findMany({ orderBy: { name: 'asc' } });
  const waConnected = wa.getStatus() === 'connected';
  res.render('groups/index', {
    title: 'Grup WhatsApp',
    groups,
    waConnected,
    currentPage: 'groups',
  });
});

// GET /groups/api/wa-list — Fetch all groups from WA device (JSON)
router.get('/api/wa-list', async (req, res) => {
  try {
    if (wa.getStatus() !== 'connected') {
      return res.json({
        success: false,
        message: 'WhatsApp belum terhubung. Silakan hubungkan WhatsApp di Dashboard terlebih dahulu.',
        groups: [],
      });
    }

    const waGroups = await wa.fetchGroups();
    const existingDbGroups = await prisma.waGroup.findMany({
      select: { id: true, jid: true },
    });
    const dbJidMap = new Map(existingDbGroups.map((g) => [g.jid, g.id]));

    const formatted = waGroups
      .map((g) => ({
        jid: g.jid,
        name: g.name || g.jid,
        isSynced: dbJidMap.has(g.jid),
        dbId: dbJidMap.get(g.jid) || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      count: formatted.length,
      groups: formatted,
    });
  } catch (err) {
    console.error('Fetch WA groups API error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Gagal mengambil daftar grup dari WhatsApp',
      groups: [],
    });
  }
});

// POST /groups/sync-selected — Sync only selected groups from WA
router.post('/sync-selected', async (req, res) => {
  try {
    let { jids, clean_unselected } = req.body;

    if (!jids) {
      req.flash('error', 'Tidak ada grup yang dipilih untuk disinkronkan');
      return res.redirect('/groups');
    }

    if (typeof jids === 'string') {
      try {
        jids = JSON.parse(jids);
      } catch (e) {
        jids = [jids];
      }
    }
    if (!Array.isArray(jids)) {
      jids = [jids];
    }

    jids = jids.filter(Boolean);

    if (jids.length === 0) {
      req.flash('error', 'Pilih minimal satu grup untuk disinkronkan');
      return res.redirect('/groups');
    }

    const waGroups = await wa.fetchGroups();
    const waGroupMap = new Map(waGroups.map((g) => [g.jid, g.name || g.jid]));

    let synced = 0;
    for (const jid of jids) {
      const name = waGroupMap.get(jid) || jid;
      await prisma.waGroup.upsert({
        where: { jid },
        update: { name, syncedAt: new Date() },
        create: { jid, name },
      });
      synced++;
    }

    // Clean unselected groups if requested
    let deleted = 0;
    if (clean_unselected === 'true' || clean_unselected === 'on' || clean_unselected === true) {
      const groupsToDelete = await prisma.waGroup.findMany({
        where: { jid: { notIn: jids } },
        select: { id: true },
      });
      const idsToDelete = groupsToDelete.map((g) => g.id);
      if (idsToDelete.length > 0) {
        await prisma.$transaction([
          prisma.commandGroup.deleteMany({ where: { waGroupId: { in: idsToDelete } } }),
          prisma.schedule.deleteMany({ where: { targetGroupId: { in: idsToDelete } } }),
          prisma.waGroup.deleteMany({ where: { id: { in: idsToDelete } } }),
        ]);
        deleted = idsToDelete.length;
      }
    }

    let msg = `${synced} grup berhasil disinkronkan ke WA Hub`;
    if (deleted > 0) {
      msg += ` dan ${deleted} grup lainnya dibersihkan dari daftar`;
    }
    req.flash('success', msg);
  } catch (err) {
    console.error('Sync selected groups error:', err);
    req.flash('error', `Gagal sync grup: ${err.message}`);
  }
  res.redirect('/groups');
});

// POST /groups/sync — Sync all groups from WA (legacy / full sync)
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

// POST /groups/bulk-delete — Delete selected groups from DB
router.post('/bulk-delete', async (req, res) => {
  try {
    let { group_ids } = req.body;

    if (!group_ids) {
      req.flash('error', 'Tidak ada grup yang dipilih untuk dihapus');
      return res.redirect('/groups');
    }

    if (typeof group_ids === 'string') {
      try {
        group_ids = JSON.parse(group_ids);
      } catch (e) {
        group_ids = [group_ids];
      }
    }
    if (!Array.isArray(group_ids)) {
      group_ids = [group_ids];
    }

    const ids = group_ids.map(Number).filter((id) => !isNaN(id) && id > 0);

    if (ids.length === 0) {
      req.flash('error', 'Grup yang dipilih tidak valid');
      return res.redirect('/groups');
    }

    await prisma.$transaction([
      prisma.commandGroup.deleteMany({ where: { waGroupId: { in: ids } } }),
      prisma.schedule.deleteMany({ where: { targetGroupId: { in: ids } } }),
      prisma.waGroup.deleteMany({ where: { id: { in: ids } } }),
    ]);

    req.flash('success', `${ids.length} grup berhasil dihapus dari daftar`);
  } catch (err) {
    console.error('Bulk delete groups error:', err);
    req.flash('error', `Gagal menghapus grup: ${err.message}`);
  }
  res.redirect('/groups');
});

// POST /groups/delete-all — Delete all groups from DB
router.post('/delete-all', async (req, res) => {
  try {
    const count = await prisma.waGroup.count();
    if (count === 0) {
      req.flash('error', 'Daftar grup sudah kosong');
      return res.redirect('/groups');
    }

    await prisma.$transaction([
      prisma.commandGroup.deleteMany({}),
      prisma.schedule.deleteMany({}),
      prisma.waGroup.deleteMany({}),
    ]);

    req.flash('success', `Semua (${count}) grup berhasil dihapus dari daftar`);
  } catch (err) {
    console.error('Delete all groups error:', err);
    req.flash('error', `Gagal mengosongkan daftar grup: ${err.message}`);
  }
  res.redirect('/groups');
});

// POST /groups/:id/delete — Remove single group from DB
router.post('/:id/delete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.$transaction([
      prisma.commandGroup.deleteMany({ where: { waGroupId: id } }),
      prisma.schedule.deleteMany({ where: { targetGroupId: id } }),
      prisma.waGroup.deleteMany({ where: { id } }),
    ]);
    req.flash('success', 'Grup berhasil dihapus dari daftar');
  } catch (err) {
    console.error('Delete group error:', err);
    req.flash('error', 'Gagal menghapus grup');
  }
  res.redirect('/groups');
});

module.exports = router;

