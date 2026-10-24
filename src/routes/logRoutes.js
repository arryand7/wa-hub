const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /logs — Message log viewer
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 25;
  const offset = (page - 1) * limit;
  const filter = req.query.filter || 'all';

  const where = {};
  if (filter !== 'all') {
    where.direction = filter;
  }
  if (req.query.status && req.query.status !== 'all') {
    where.status = req.query.status;
  }

  const [logs, total] = await Promise.all([
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: { command: true, schedule: true },
    }),
    prisma.messageLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  res.render('logs/index', {
    title: 'Riwayat Log',
    logs,
    total,
    page,
    totalPages,
    filter,
    statusFilter: req.query.status || 'all',
    currentPage: 'logs',
  });
});

// POST /logs/clear — Clear old logs
router.post('/clear', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count } = await prisma.messageLog.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    req.flash('success', `${count} log lama (>30 hari) berhasil dihapus`);
  } catch (err) {
    req.flash('error', 'Gagal menghapus log');
  }
  res.redirect('/logs');
});

module.exports = router;
