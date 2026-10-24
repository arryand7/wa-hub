const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const ejsLayouts = require('express-ejs-layouts');
const path = require('path');
const config = require('./config');

const { requireAuth } = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const appRoutes = require('./routes/appRoutes');
const commandRoutes = require('./routes/commandRoutes');
const groupRoutes = require('./routes/groupRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const logRoutes = require('./routes/logRoutes');
const apiRoutes = require('./routes/apiRoutes');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// The public TLS endpoint terminates at the local Nginx reverse proxy.
app.set('trust proxy', 'loopback');

// ─── View Engine ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');
app.use(ejsLayouts);

// ─── Middleware ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
    },
  })
);

// Flash messages
app.use(flash());

// Global locals for views
app.use((req, res, next) => {
  res.locals.flash_success = req.flash('success');
  res.locals.flash_error = req.flash('error');
  res.locals.admin = req.session.admin || null;
  next();
});

// ─── Routes ──────────────────────────────────────────────────
app.use('/healthz', healthRoutes);
app.use('/auth', authRoutes);
app.use('/', requireAuth, dashboardRoutes);
app.use('/apps', requireAuth, appRoutes);
app.use('/commands', requireAuth, commandRoutes);
app.use('/groups', requireAuth, groupRoutes);
app.use('/schedules', requireAuth, scheduleRoutes);
app.use('/logs', requireAuth, logRoutes);
app.use('/api/v1', apiRoutes);

// ─── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('errors/404', { title: '404', currentPage: '' });
});

// ─── Error Handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('errors/500', { title: 'Error', currentPage: '' });
});

module.exports = app;
