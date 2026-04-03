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
 * Run the full historical backfill for all BTC/ETH option contracts.
 *
 * Flow:
 *  1. Sync instruments (fetch all live+expired from Delta API → SQLite)
 *  2. Init QuestDB table
 *  3. For each instrument:
 *     - Find resume point (last stored candle timestamp)
 *     - Fetch day-by-day from backfill start (or resume) to now
 *     - Insert each chunk into QuestDB via ILP
 *  4. Concurrency limited by config.pipeline.concurrency
 *
 * @param {object} options
 * @param {string}  [options.fromDate]    - Override start date 'YYYY-MM-DD'
 * @param {string}  [options.underlying]  - Restrict to 'BTC' or 'ETH'
 * @param {boolean} [options.skipSync]    - Skip instrument sync (use cached SQLite)
 */
async function runBackfill(options = {}) {
  const startTime = Date.now();
  logger.info('═══════════════════════════════════════════════════');
  logger.info('  BTC/ETH OPTIONS BACKFILL — Starting');
  logger.info('═══════════════════════════════════════════════════');

  // ── Step 1: Sync instruments from Delta API ───────────────────────────────
  if (!options.skipSync) {
    logger.info('Step 1/3: Syncing instruments from Delta Exchange…');
    await syncInstruments();
  } else {
    logger.info('Step 1/3: Skipping instrument sync (--skip-sync flag set)');
    sqlite.init();
  }

  // ── Step 2: Init QuestDB table ────────────────────────────────────────────
  logger.info('Step 2/3: Initializing QuestDB schema…');
  await questdb.initTables();

  // ── Step 3: Load instruments & backfill candles ───────────────────────────
  logger.info('Step 3/3: Starting candle backfill…');

  const allInstruments = sqlite.getAllInstruments(options.underlying || null);
  logger.info(`Instruments to backfill: ${allInstruments.length}`);

  if (allInstruments.length === 0) {
    logger.warn('No instruments found in SQLite. Run without --skip-sync to fetch them first.');
    return;
  }

  // Backfill start epoch (seconds)
  const fromDateStr = options.fromDate || config.pipeline.backfillStartDate;
  const globalStartTs = dayjs.utc(fromDateStr).unix();
  const nowTs = Math.floor(Date.now() / 1000);

  logger.info(`Backfill window: ${fromDateStr} → now (${dayjs.utc().format('YYYY-MM-DD')})`);

  // ── Concurrency limiter ───────────────────────────────────────────────────
  const limit = pLimit(config.pipeline.concurrency);

  let completed = 0;
  let totalCandles = 0;
  let errors = 0;

  const tasks = allInstruments.map((instrument) =>
    limit(async () => {
      const { symbol } = instrument;

      try {
        // Resume from last saved point if available
        const lastTs = await questdb.getLastCandleTimestamp(symbol);
        // Add 60s to avoid re-fetching the last candle
        const startTs = lastTs ? lastTs + 60 : globalStartTs;

        if (startTs >= nowTs) {
          logger.debug(`${symbol}: already up to date, skipping`);
          completed++;
          return;
        }

        const resumeInfo = lastTs
          ? `resuming from ${dayjs.utc(lastTs * 1000).format('YYYY-MM-DD HH:mm')}`
          : `starting from ${fromDateStr}`;

        logger.info(`[${completed + 1}/${allInstruments.length}] ${symbol} — ${resumeInfo}`);

        let symbolCandles = 0;

        // Stream chunks → insert immediately (memory efficient)
        for await (const chunk of fetchCandlesChunked(symbol, startTs, nowTs)) {
          await questdb.insertCandles(chunk);
          symbolCandles += chunk.length;
          totalCandles += chunk.length;
        }

        if (symbolCandles > 0) {
          logger.info(`✓ ${symbol}: inserted ${symbolCandles.toLocaleString()} candles`);
        } else {
          logger.debug(`○ ${symbol}: no candle data found`);
        }

      } catch (err) {
        errors++;
        logger.error(`✗ ${symbol}: backfill failed`, { error: err.message });
      } finally {
        completed++;
        // Progress log every 50 symbols
        if (completed % 50 === 0) {
          logger.info(`Progress: ${completed}/${allInstruments.length} symbols | ${totalCandles.toLocaleString()} candles inserted`);
        }
      }
    })
  );

  await Promise.all(tasks);

  // ── Flush remaining ILP buffer ────────────────────────────────────────────
  await questdb.closeSender();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalInDb = await questdb.getTotalCandleCount();

  logger.info('═══════════════════════════════════════════════════');
  logger.info('  BACKFILL COMPLETE');
  logger.info(`  Symbols processed  : ${allInstruments.length}`);
  logger.info(`  Candles inserted   : ${totalCandles.toLocaleString()}`);
  logger.info(`  Total in QuestDB   : ${totalInDb.toLocaleString()}`);
  logger.info(`  Errors             : ${errors}`);
  logger.info(`  Time elapsed       : ${elapsed} minutes`);
  logger.info('═══════════════════════════════════════════════════');
}

module.exports = { runBackfill };
