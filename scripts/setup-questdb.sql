-- ============================================================
--  QuestDB Schema Setup for BTC/ETH Options Pipeline
--  Run these in QuestDB Web Console: http://localhost:9000
-- ============================================================

-- ── Main candles table ────────────────────────────────────────────────────────
-- SYMBOL type: dictionary-encoded string for high-cardinality repeated values
-- WAL: Write-Ahead Log mode for concurrent safe writes
-- DEDUP UPSERT KEYS: prevents duplicate rows on (ts, symbol)
-- PARTITION BY DAY: time-based partitioning for fast range queries
CREATE TABLE IF NOT EXISTS candles (
    ts      TIMESTAMP,
    symbol  SYMBOL CAPACITY 8192 CACHE INDEX,
    open    DOUBLE,
    high    DOUBLE,
    low     DOUBLE,
    close   DOUBLE,
    volume  DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, symbol);


-- ── Verify table was created ───────────────────────────────────────────────────
-- SHOW TABLES;
-- SHOW COLUMNS FROM candles;


-- ── Useful maintenance queries ────────────────────────────────────────────────

-- Count total candles
-- SELECT count() FROM candles;

-- Count candles per symbol
-- SELECT symbol, count() as candles
-- FROM candles
-- ORDER BY candles DESC;

-- Date range of stored data
-- SELECT min(ts), max(ts) FROM candles;

-- Storage size estimate
-- SELECT * FROM table_partitions('candles');
