'use strict';

const pLimit = require('p-limit').default || require('p-limit');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const sqlite = require('../sqlite');
const questdb = require('../questdb');
const { fetchCandlesChunked } = require('../fetchers/fetchCandles');
const { syncInstruments } = require('../fetchers/fetchInstruments');
const config = require('../config');
const logger = require('../logger');

/**
 * Run the daily incremental update job.
 * Designed to run after UTC midnight — fetches previous day's candles
 * for all instruments and appends to QuestDB.
 *
 * @param {object} options
 * @param {string}  [options.date]         - Override date 'YYYY-MM-DD' (defaults to yesterday UTC)
 * @param {boolean} [options.syncFirst]    - Re-sync instruments before updating (picks up new listings)
 * @param {string}  [options.underlying]   - Restrict to 'BTC' or 'ETH'
 */
async function runDailyUpdate(options = {}) {
  const startTime = Date.now();

  // ── Determine update window ───────────────────────────────────────────────
  // Default: yesterday UTC (midnight → midnight)
  const targetDate = options.date
    ? dayjs.utc(options.date)
    : dayjs.utc().subtract(1, 'day');

  const windowStart = targetDate.startOf('day').unix();
  const windowEnd   = targetDate.endOf('day').add(1, 'second').unix();

  logger.info('═══════════════════════════════════════════════════');
  logger.info('  DAILY UPDATE — Starting');
  logger.info(`  Target date: ${targetDate.format('YYYY-MM-DD')} UTC`);
  logger.info(`  Window: ${new Date(windowStart * 1000).toISOString()} → ${new Date(windowEnd * 1000).toISOString()}`);
  logger.info('═══════════════════════════════════════════════════');

  // ── Optionally re-sync instruments ────────────────────────────────────────
  if (options.syncFirst) {
    logger.info('Syncing instruments (picking up any new listings)…');
    await syncInstruments();
  } else {
    sqlite.init();
  }

  // ── Ensure QuestDB table exists ───────────────────────────────────────────
  await questdb.initTables();

  // ── Load instruments ──────────────────────────────────────────────────────
  const instruments = sqlite.getAllInstruments(options.underlying || null);
  logger.info(`Instruments to update: ${instruments.length}`);

  if (instruments.length === 0) {
    logger.warn('No instruments in SQLite. Run backfill first.');
    return;
  }

  const limit = pLimit(config.pipeline.concurrency);
  let completed = 0;
  let totalCandles = 0;
  let errors = 0;

  const tasks = instruments.map((instrument) =>
    limit(async () => {
      const { symbol, state } = instrument;

      // Skip expired contracts that expired before target date
      // (they won't have new data)
      if (state === 'expired' && instrument.expiry) {
        const expiryTs = new Date(instrument.expiry).getTime() / 1000;
        if (expiryTs < windowStart) {
          logger.debug(`${symbol}: expired before target date, skipping`);
          completed++;
          return;
        }
      }

      try {
        let symbolCandles = 0;

        for await (const chunk of fetchCandlesChunked(symbol, windowStart, windowEnd)) {
          await questdb.insertCandles(chunk);
          symbolCandles += chunk.length;
          totalCandles += chunk.length;
        }

        if (symbolCandles > 0) {
          logger.info(`✓ ${symbol}: ${symbolCandles} candles`);
        }

      } catch (err) {
        errors++;
        logger.error(`✗ ${symbol}: update failed`, { error: err.message });
      } finally {
        completed++;
      }
    })
  );

  await Promise.all(tasks);

  // ── Flush ILP buffer ──────────────────────────────────────────────────────
  await questdb.closeSender();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  logger.info('═══════════════════════════════════════════════════');
  logger.info('  DAILY UPDATE COMPLETE');
  logger.info(`  Date               : ${targetDate.format('YYYY-MM-DD')}`);
  logger.info(`  Symbols processed  : ${instruments.length}`);
  logger.info(`  Candles inserted   : ${totalCandles.toLocaleString()}`);
  logger.info(`  Errors             : ${errors}`);
  logger.info(`  Time elapsed       : ${elapsed}s`);
  logger.info('═══════════════════════════════════════════════════');
}

module.exports = { runDailyUpdate };
