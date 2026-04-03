-- ============================================================
--  Example QuestDB Time-Series Queries
--  For BTC/ETH Options Candle Data
--  Run in QuestDB Web Console: http://localhost:9000
-- ============================================================


-- ── 1. Latest candle for each symbol ─────────────────────────────────────────
SELECT symbol, max(ts) AS last_candle, last(close) AS last_price
FROM candles
SAMPLE BY 1d FILL(NONE)
LATEST ON ts PARTITION BY symbol;


-- ── 2. All 1-minute candles for a specific contract ───────────────────────────
SELECT ts, open, high, low, close, volume
FROM candles
WHERE symbol = 'C-BTC-50000-261226'   -- replace with actual symbol
  AND ts BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY ts ASC;


-- ── 3. Hourly OHLCV aggregation (downsample from 1m) ─────────────────────────
SELECT
    ts,
    symbol,
    first(open)  AS open,
    max(high)    AS high,
    min(low)     AS low,
    last(close)  AS close,
    sum(volume)  AS volume
FROM candles
WHERE symbol = 'C-BTC-50000-261226'
SAMPLE BY 1h ALIGN TO CALENDAR;


-- ── 4. Daily OHLCV aggregation ────────────────────────────────────────────────
SELECT
    ts,
    symbol,
    first(open)  AS open,
    max(high)    AS high,
    min(low)     AS low,
    last(close)  AS close,
    sum(volume)  AS volume
FROM candles
WHERE symbol = 'C-BTC-50000-261226'
SAMPLE BY 1d ALIGN TO CALENDAR;


-- ── 5. VWAP per hour for a symbol (Volume Weighted Average Price) ─────────────
SELECT
    ts,
    symbol,
    sum(close * volume) / sum(volume) AS vwap,
    sum(volume) AS total_volume
FROM candles
WHERE symbol = 'C-BTC-50000-261226'
SAMPLE BY 1h ALIGN TO CALENDAR;


-- ── 6. All BTC call options candles on a specific day ────────────────────────
SELECT *
FROM candles
WHERE ts >= '2024-06-01' AND ts < '2024-06-02'
  AND symbol LIKE 'C-BTC%'
ORDER BY ts, symbol;


-- ── 7. Daily total volume by underlying (BTC vs ETH) ─────────────────────────
SELECT
    ts,
    CASE WHEN symbol LIKE 'C-BTC%' OR symbol LIKE 'P-BTC%' THEN 'BTC' ELSE 'ETH' END AS underlying,
    sum(volume) AS total_volume
FROM candles
SAMPLE BY 1d ALIGN TO CALENDAR;


-- ── 8. Most actively traded symbols (by total volume) ─────────────────────────
SELECT symbol, sum(volume) AS total_volume, count() AS candle_count
FROM candles
GROUP BY symbol
ORDER BY total_volume DESC
LIMIT 50;


-- ── 9. Detect data gaps (missing minutes) for a symbol ───────────────────────
-- Find gaps > 2 minutes between consecutive candles
WITH ordered AS (
    SELECT ts, lead(ts) OVER (ORDER BY ts) AS next_ts
    FROM candles
    WHERE symbol = 'C-BTC-50000-261226'
)
SELECT ts AS gap_start, next_ts AS gap_end,
       datediff('m', ts, next_ts) AS gap_minutes
FROM ordered
WHERE datediff('m', ts, next_ts) > 2
ORDER BY gap_minutes DESC;


-- ── 10. Rolling 20-period SMA on close prices ───────────────────────────────
SELECT
    ts,
    close,
    avg(close) OVER (
        PARTITION BY symbol
        ORDER BY ts
        ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
    ) AS sma_20
FROM candles
WHERE symbol = 'C-BTC-50000-261226'
ORDER BY ts;


-- ── 11. Count symbols with data per underlying ───────────────────────────────
SELECT
    CASE WHEN symbol LIKE 'C-BTC%' OR symbol LIKE 'P-BTC%' THEN 'BTC' ELSE 'ETH' END AS underlying,
    count(DISTINCT symbol) AS symbol_count,
    count() AS total_candles,
    min(ts) AS earliest,
    max(ts) AS latest
FROM candles;


-- ── 12. Implied volatility proxy: daily high-low range % ────────────────────
SELECT
    ts,
    symbol,
    (max(high) - min(low)) / min(low) * 100 AS daily_range_pct,
    sum(volume) AS volume
FROM candles
WHERE symbol LIKE 'C-BTC%'
SAMPLE BY 1d ALIGN TO CALENDAR
ORDER BY daily_range_pct DESC
LIMIT 20;


-- ── 13. Candle count per symbol (completeness check) ─────────────────────────
SELECT
    symbol,
    count() AS candles,
    min(ts) AS first_candle,
    max(ts) AS last_candle
FROM candles
GROUP BY symbol
ORDER BY candles DESC;
