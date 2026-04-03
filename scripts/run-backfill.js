'use strict';

require('dotenv').config();

const { runBackfill } = require('../src/pipeline/backfill');
const logger = require('../src/logger');
const fs = require('fs');

// ── Create logs directory if it doesn't exist ─────────────────────────────────
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });

// ── Parse CLI arguments ───────────────────────────────────────────────────────
// Usage:
//   node scripts/run-backfill.js
//   node scripts/run-backfill.js --from=2022-01-01
//   node scripts/run-backfill.js --from=2022-01-01 --underlying=BTC
//   node scripts/run-backfill.js --skip-sync
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=');
  acc[key] = val || true;
  return acc;
}, {});

const options = {
  fromDate:   args['from']       || null,       // e.g. '2020-01-01'
  underlying: args['underlying'] || null,       // 'BTC' or 'ETH'
  skipSync:   args['skip-sync']  === true || args['skip-sync'] === 'true',
};

logger.info('Run backfill with options:', options);

runBackfill(options)
  .then(() => {
    logger.info('Backfill script finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Backfill script crashed:', { error: err.message, stack: err.stack });
    process.exit(1);
  });
