// Session-based auth middleware for dashboard routes
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    res.locals.admin = req.session.admin;
    return next();
  }
  req.flash('error', 'Silakan login terlebih dahulu');
  return res.redirect('/auth/login');
}

function guestOnly(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect('/');
  }
  return next();
}

module.exports = { requireAuth, guestOnly };
