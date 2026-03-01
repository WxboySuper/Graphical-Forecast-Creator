'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3002', 10);
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'analytics.log');

// Ensure log directory exists on startup
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const app = express();

// 1 kb body limit — more than enough for page + referrer; blocks abuse
app.use(express.json({ limit: '1kb' }));

app.post('/collect', (req, res) => {
  // Sanitise and cap all user-controlled fields
  const page = (typeof req.body?.page === 'string' ? req.body.page : '/').slice(0, 200);
  const referrer = (typeof req.body?.referrer === 'string' ? req.body.referrer : '').slice(0, 500);

  // nginx sets X-Forwarded-For to $remote_addr (trusted, since server is loopback-only)
  const ip = ((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') + '')
    .split(',')[0]
    .trim();

  const entry = {
    ts: new Date().toISOString(),
    ip,
    ua: (req.headers['user-agent'] || '').slice(0, 300),
    page,
    ref: referrer,
  };

  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    res.status(204).end();
  } catch (err) {
    console.error('[analytics] failed to write log:', err);
    res.status(500).end();
  }
});

// Reject everything else quietly
app.use((_req, res) => res.status(404).end());

// Bind to loopback only — never exposed to the internet directly (nginx proxies in)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[analytics] listening on 127.0.0.1:${PORT} (port ${PORT})`);
  console.log(`[analytics] writing to ${LOG_FILE}`);
});
