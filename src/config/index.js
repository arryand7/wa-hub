require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || 'fallback-secret-key',
  NODE_ENV: process.env.NODE_ENV || 'development',
  TIMEZONE: 'Asia/Jakarta',
};
