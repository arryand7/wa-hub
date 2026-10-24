const prisma = require('../lib/prisma');

// API Key authentication middleware for /api/v1/* routes
async function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ success: false, message: 'API Key diperlukan' });
  }

  try {
    const key = await prisma.apiKey.findUnique({
      where: { keyValue: apiKey },
    });

    if (!key || !key.isActive) {
      return res.status(403).json({ success: false, message: 'API Key tidak valid atau nonaktif' });
    }

    req.apiKey = key;
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { requireApiKey };
