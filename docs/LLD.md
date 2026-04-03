# Low-Level Design (LLD): BTC/ETH Options Data Pipeline

## 1. Directory Structure Details

```text
├── src/
│   ├── config.js               # Env parser and static const mappings
│   ├── logger.js               # Winston logger formats
│   ├── deltaClient.js          # REST Client (Axios) wrapping logic
│   ├── questdb.js              # DB interface logic (Isolated HTTP Sender / PG Queries)
│   ├── sqlite.js               # SQLite bindings (better-sqlite3)
│   ├── fetchers/
│   │   ├── fetchInstruments.js # Implementation for parsing Products Endpoint
│   │   └── fetchCandles.js     # Chunks date requests to limit boundary sizes
│   └── pipeline/
│       ├── backfill.js         # The main backfill runner loop logic
│       └── dailyUpdate.js      # Post-midnight delta processor logic
```

## 2. API Schema Implementations

### Endpoint: `/v2/products`
*   **Method:** `GET`
*   **Query Params:**
    *   `contract_types`: `call_options,put_options`
    *   `states`: `live,expired`
    *   `page_size`: `500`
    *   `after`: `<cursor_token>` (Pulled from previous response `meta.after`)
*   **Data Transformation:** We only extract arrays where `underlying_asset` equals 'BTC' or 'ETH'. Normalizes strike price string arrays to flat integers/floats.

### Endpoint: `/v2/history/candles`
*   **Method:** `GET`
*   **Query Params Requirements:**
    *   `resolution`: `1m`
    *   `start`: UNIX TIMESTAMP SECONDS
    *   `end`: UNIX TIMESTAMP SECONDS
    *   `symbol`: Native API Symbol (e.g., `C-BTC-50000-261226`)
*   **Constraint Management Module:** Includes a Fast-Forward pre-fetcher mapping `resolution: 1d` to extract exact `timeJump` timestamps, bypassing thousands of empty day crawls before initializing `async fetchCandlesChunked()` 1m generator bounds. All symbol requests are prefixed with `MARK:` to retrieve Mark Price data.
*   **Data Transformation:** Mark Price response only provides a `close` value. The system maps this single value to `open`, `high`, `low`, and `close` in the database to maintain schema compatibility. `volume` is defaulted to `0`.

## 3. Database Schemas

### SQLite: `instruments` Table
```sql
CREATE TABLE instruments (
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
```
**Indices applied:** `idx_instruments_underlying`, `idx_instruments_state`, `idx_instruments_contract`, `idx_instruments_expiry`.

### QuestDB: `candles` Table
```sql
CREATE TABLE candles (
    ts      TIMESTAMP,
    symbol  SYMBOL CAPACITY 8192 CACHE INDEX,
    open    DOUBLE,
    high    DOUBLE,
    low     DOUBLE,
    close   DOUBLE,
    volume  DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, symbol);
```
**Implementation Note:** ILP Sender transforms UNIX seconds from the REST hook directly into precise Nanoseconds via `BigInt(row.time) * 1_000_000_000n` prior to byte stream insertion.

## 4. Pipeline Logic Implementation Notes

**Backfill Routine (`src/pipeline/backfill.js`):**
1. Leverages `p-limit` module initialized via `const limit = pLimit(config.pipeline.concurrency)`.
2. Validates symbol baseline by executing `getLastCandleTimestamp(symbol)` natively against PG protocol port `8812`.
3. Streams generators yielding arrays directly inserted continuously preventing internal node heap accumulation limits from breaching `1.4GB` during multiple parallel symbol backfills.

**Daily Update Routine (`src/pipeline/dailyUpdate.js`):**
1. Excludes contracts if `state === 'expired'` AND `expiryTs < windowStart` mapping natively preventing wasted fetches over historically dead options during daily cron jobs.
