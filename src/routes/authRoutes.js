const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { guestOnly } = require('../middleware/auth');

const router = express.Router();

// GET /auth/login
router.get('/login', guestOnly, (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    layout: false,
  });
});

// POST /auth/login
router.post('/login', guestOnly, async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({ where: { username } });

    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      req.flash('error', 'Username atau password salah');
      return res.redirect('/auth/login');
    }

    req.session.admin = {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
    };

    req.flash('success', `Selamat datang, ${admin.displayName}!`);
    return res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Terjadi kesalahan server');
    return res.redirect('/auth/login');
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
