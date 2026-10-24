require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (NODE_ENV === 'production' && (
  !SESSION_SECRET || SESSION_SECRET.length < 32 || /replace-with|change-me|example|your-/i.test(SESSION_SECRET)
)) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production');
}

module.exports = {
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT || 3000),
  SESSION_SECRET: SESSION_SECRET || 'development-only-secret',
  NODE_ENV,
  TIMEZONE: process.env.TZ || 'Asia/Jakarta',
};
