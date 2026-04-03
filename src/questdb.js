'use strict';

const { Sender } = require('@questdb/nodejs-client');
const { Client } = require('pg');
const config = require('./config');
const logger = require('./logger');

// ─── ILP Sender (for bulk writes) ─────────────────────────────────────────────
let sender = null;

async function getSender() {
  if (sender) return sender;
  sender = await Sender.fromConfig(
    `tcp::addr=${config.questdb.host}:${config.questdb.ilpPort};`
  );
  logger.info(`QuestDB ILP sender connected → ${config.questdb.host}:${config.questdb.ilpPort}`);
  return sender;
}

async function closeSender() {
  if (sender) {
    await sender.flush();
    await sender.close();
    sender = null;
    logger.info('QuestDB ILP sender closed');
  }
}

// ─── PG Client (for DDL and queries) ──────────────────────────────────────────
async function getPgClient() {
  const client = new Client({
    host: config.questdb.host,
    port: config.questdb.pgPort,
    user: config.questdb.user,
    password: config.questdb.password,
    database: config.questdb.database,
  });
  await client.connect();
  return client;
}

// ─── Table Initialization ─────────────────────────────────────────────────────
async function initTables() {
  const pg = await getPgClient();
  try {
    // QuestDB CREATE TABLE IF NOT EXISTS with WAL + partitioned by DAY
    await pg.query(`
      CREATE TABLE IF NOT EXISTS candles (
        ts      TIMESTAMP,
        symbol  SYMBOL CAPACITY 8192 CACHE INDEX,
        open    DOUBLE,
        high    DOUBLE,
        low     DOUBLE,
        close   DOUBLE,
        volume  DOUBLE
      ) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, symbol);
    `);
    logger.info('QuestDB table "candles" ready (WAL, partitioned by DAY, deduped on ts+symbol)');
  } finally {
    await pg.end();
  }
}

// ─── Get last candle timestamp for a symbol ───────────────────────────────────
/**
 * Returns the last stored timestamp (as Unix seconds) for a symbol,
 * or null if no data exists. Used to resume interrupted backfills.
 */
async function getLastCandleTimestamp(symbol) {
  const pg = await getPgClient();
  try {
    const result = await pg.query(
      `SELECT max(ts) AS last_ts FROM candles WHERE symbol = $1`,
      [symbol]
    );
    const lastTs = result.rows[0]?.last_ts;
    if (!lastTs) return null;
    // QuestDB returns timestamps as microseconds epoch — convert to seconds
    return Math.floor(new Date(lastTs).getTime() / 1000);
  } catch (err) {
    // Table might not exist yet or symbol not found — return null
    return null;
  } finally {
    await pg.end();
  }
}

// ─── Insert candles batch via ILP (HTTP - isolated per batch) ───────────────
/**
 * @param {Array<{time: number, symbol: string, open: number, high: number, low: number, close: number, volume: number}>} rows
 * time is Unix seconds
 */
async function insertCandles(rows) {
  if (!rows || rows.length === 0) return;

  // Use an isolated HTTP sender per batch to prevent async race conditions 
  // from concurrent p-limit pipelines interlacing the shared state buffer.
  const sender = await Sender.fromConfig(
    `http::addr=${config.questdb.host}:${config.questdb.httpPort};`
  );

  try {
    for (const row of rows) {
      // ILP timestamp must be in nanoseconds
      const tsNanos = BigInt(row.time) * 1_000_000_000n;

      sender.table('candles')
        .symbol('symbol', row.symbol)
        .floatColumn('open',   row.open)
        .floatColumn('high',   row.high)
        .floatColumn('low',    row.low)
        .floatColumn('close',  row.close)
        .floatColumn('volume', row.volume)
        .at(tsNanos, 'ns');
    }

    await sender.flush();
  } finally {
    await sender.close();
  }
}

// ─── Count candles for a symbol ───────────────────────────────────────────────
async function getCandleCount(symbol) {
  const pg = await getPgClient();
  try {
    const result = await pg.query(
      `SELECT count() AS cnt FROM candles WHERE symbol = $1`,
      [symbol]
    );
    return parseInt(result.rows[0]?.cnt || '0', 10);
  } finally {
    await pg.end();
  }
}

// ─── Total candle count ───────────────────────────────────────────────────────
async function getTotalCandleCount() {
  const pg = await getPgClient();
  try {
    const result = await pg.query(`SELECT count() AS cnt FROM candles`);
    return parseInt(result.rows[0]?.cnt || '0', 10);
  } catch {
    return 0;
  } finally {
    await pg.end();
  }
}

module.exports = {
  initTables,
  getSender,
  closeSender,
  insertCandles,
  getLastCandleTimestamp,
  getCandleCount,
  getTotalCandleCount,
};
