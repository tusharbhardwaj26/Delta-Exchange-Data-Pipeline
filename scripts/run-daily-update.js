'use strict';

require('dotenv').config();

const { runDailyUpdate } = require('../src/pipeline/dailyUpdate');
const logger = require('../src/logger');
const fs = require('fs');

// ── Create logs directory ──────────────────────────────────────────────────────
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });

// ── Parse CLI args ────────────────────────────────────────────────────────────
// Usage:
//   node scripts/run-daily-update.js
//   node scripts/run-daily-update.js --date=2024-06-01
//   node scripts/run-daily-update.js --sync-first --underlying=ETH
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

const options = {
  date:        args['date']         || null,
  syncFirst:   args['sync-first']   === true || args['sync-first'] === 'true',
  underlying:  args['underlying']   || null,
};

logger.info('Run daily update with options:', options);

runDailyUpdate(options)
  .then(() => {
    logger.info('Daily update script finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Daily update script crashed:', { error: err.message, stack: err.stack });
    process.exit(1);
  });
