const express = require('express');
const prisma = require('../lib/prisma');
const wa = require('../lib/whatsapp');

const router = express.Router();

// GET / — Dashboard Home
router.get('/', async (req, res) => {
  try {
    const [appCount, commandCount, scheduleCount, groupCount, recentLogs] = await Promise.all([
      prisma.app.count(),
      prisma.command.count(),
      prisma.schedule.count({ where: { isActive: true } }),
      prisma.waGroup.count(),
      prisma.messageLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.render('dashboard/index', {
      title: 'Dashboard',
      waStatus: wa.getStatus(),
      stats: { appCount, commandCount, scheduleCount, groupCount },
      recentLogs,
      currentPage: 'dashboard',
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error', 'Gagal memuat dashboard');
    res.render('dashboard/index', {
      title: 'Dashboard',
      waStatus: 'disconnected',
      stats: { appCount: 0, commandCount: 0, scheduleCount: 0, groupCount: 0 },
      recentLogs: [],
      currentPage: 'dashboard',
    });
  }
});

module.exports = router;
