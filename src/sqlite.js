'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

let db = null;

/**
 * Initialize SQLite database and create instruments table
 */
function init() {
  const dbPath = path.resolve(config.sqlite.path);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS instruments (
      symbol          TEXT PRIMARY KEY,
      contract_type   TEXT NOT NULL,
      underlying      TEXT NOT NULL,
      strike_price    REAL,
      expiry          TEXT,
      state           TEXT NOT NULL,
      product_id      INTEGER,
      description     TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_instruments_underlying  ON instruments(underlying);
    CREATE INDEX IF NOT EXISTS idx_instruments_state       ON instruments(state);
    CREATE INDEX IF NOT EXISTS idx_instruments_contract    ON instruments(contract_type);
    CREATE INDEX IF NOT EXISTS idx_instruments_expiry      ON instruments(expiry);
  `);

  logger.info(`SQLite initialized at ${dbPath}`);
  return db;
}

/**
 * Upsert a batch of instruments
 * @param {Array<object>} instruments
 */
function upsertInstruments(instruments) {
  if (!db) init();

  const upsert = db.prepare(`
    INSERT INTO instruments
      (symbol, contract_type, underlying, strike_price, expiry, state, product_id, description, updated_at)
    VALUES
      (@symbol, @contract_type, @underlying, @strike_price, @expiry, @state, @product_id, @description, datetime('now'))
    ON CONFLICT(symbol) DO UPDATE SET
      state       = excluded.state,
      updated_at  = excluded.updated_at
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });

  insertMany(instruments);
  logger.debug(`Upserted ${instruments.length} instruments into SQLite`);
}

/**
 * Get all instruments, optionally filtered by underlying
 * @param {string|null} underlying - e.g. 'BTC', 'ETH', or null for all
 * @returns {Array<object>}
 */
function getAllInstruments(underlying = null) {
  if (!db) init();

  if (underlying) {
    return db.prepare('SELECT * FROM instruments WHERE underlying = ? ORDER BY expiry ASC').all(underlying);
  }
  return db.prepare('SELECT * FROM instruments ORDER BY underlying, expiry ASC').all();
}

/**
 * Get total instrument count
 */
function getInstrumentCount() {
  if (!db) init();
  return db.prepare('SELECT COUNT(*) as count FROM instruments').get().count;
}

/**
 * Get count by underlying
 */
function getCountByUnderlying() {
  if (!db) init();
  return db.prepare('SELECT underlying, COUNT(*) as count FROM instruments GROUP BY underlying').all();
}

/**
 * Close the database connection
 */
function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { init, upsertInstruments, getAllInstruments, getInstrumentCount, getCountByUnderlying, close };
