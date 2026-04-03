# BTC/ETH Options Data Pipeline

![Node.js](https://img.shields.io/badge/Node.js-18+-success?logo=nodedotjs)
![QuestDB](https://img.shields.io/badge/QuestDB-Time--Series-blue)
![SQLite](https://img.shields.io/badge/SQLite-Metadata-lightgrey)
![License](https://img.shields.io/badge/License-MIT-green)

A production-grade, highly concurrent Node.js data pipeline engineered to collect, index, and store high-resolution 1-minute OHLCV (Open, High, Low, Close, Volume) candle data for **Bitcoin (BTC)** and **Ethereum (ETH)** options via the Delta Exchange India API. 

This system supports comprehensive historical backfilling (spanning from 2020) and automated nightly data synchronization.

---

## Executive Summary (For Non-Technical Readers)

**What does this project do?**
Imagine trying to download the price history of thousands of individual stock options, minute-by-minute, over the span of several years. It's a massive amount of data. This project is a "data engine" that automatically connects to a cryptocurrency exchange (Delta Exchange), finds every single Bitcoin and Ethereum option constraint that has ever existed, and safely downloads its minute-by-minute trading history. 

**Why is it useful?**
To build trading algorithms, research market trends, or backtest financial strategies, analysts need massive amounts of historical data. This pipeline automates the grueling work of collecting that data, organizing it perfectly, and storing it into an extremely fast database (QuestDB) so researchers can instantly ask questions like: *"What was the average trading volume of Bitcoin call options exactly one hour before expiration in 2022?"*

**How does it work?**
1. **The Scout:** It first searches the exchange for a master list of all contracts. 
2. **The Harvester:** It goes back in time to the year 2020 and downloads the price data for those contracts. It is equipped with a "1D Fast-Forward Engine" that instantly skips years of dead history for untraded options, saving massive bandwidth. If the internet drops or the exchange says "slow down," the harvester pauses and resumes exactly where it left off.
3. **The Night Shift:** Once caught up to the present day, a daily worker wakes up every night at midnight to pull down the previous day's trading data so your database is always perfectly up to date.

---

## Project Documentation
*   [High-Level Design (HLD)](./docs/HLD.md)
*   [Low-Level Design (LLD)](./docs/LLD.md)
*   [License (MIT - Tushar Bhardwaj)](./LICENSE)

---

## System Architecture

The pipeline strictly separates static metadata and voluminous time-series data to optimize query performance and ingestion speed.

```text
Delta Exchange India API
  ├─ GET /v2/products          (All BTC/ETH options, live + expired)
  └─ GET /v2/history/candles   (1-min OHLCV, 24h chunked)
          │
          ▼
   Node.js Data Pipeline
   ├── SQLite         → Stores distinct instruments (symbol, strike, expiry).
   └── QuestDB (HTTP) → Stores millions of candles (ts, symbol, open, high, low, close, volume).
                         * Isolated per-batch HTTP Senders mapped to port 9000
                         * Partitioned by DAY
                         * Indexed by SYMBOL
                         * WAL dedup enabled
```

---

## Prerequisites & Environment Setup

### 1. Requirements
* Node.js **v18+** (`node --version`)
* A running instance of **QuestDB**

### 2. Launching QuestDB
QuestDB is our high-performance time-series engine. 

**Option A — Docker (Recommended)**
```bash
docker run -d \
  --name questdb \
  -p 9000:9000 -p 9009:9009 -p 8812:8812 \
  -v questdb-data:/var/lib/questdb \
  questdb/questdb:latest
```

**Option B — Windows Direct Install**
Download the Windows installer directly from [questdb.io/get-questdb/](https://questdb.io/get-questdb/).

### 3. Database Initialization
Once QuestDB is running, open the Web Console: [http://localhost:9000](http://localhost:9000)

Copy and execute the DDL script found in `scripts/setup-questdb.sql` to initialize the pipeline tables:
```sql
CREATE TABLE IF NOT EXISTS candles (
    ts      TIMESTAMP,
    symbol  SYMBOL CAPACITY 8192 CACHE INDEX,
    open    DOUBLE,
    high    DOUBLE,
    low     DOUBLE,
    close   DOUBLE,
    volume  DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, symbol);
```

---

## Installation & Usage

### 1. Install Dependencies
```bash
git clone <repository_url>
cd "Data Pipeline"
npm install
```

### 2. Configuration (`.env`)
The system defaults are tuned for stability and rate-limit compliance.
```env
DELTA_BASE_URL=https://api.india.delta.exchange
QUESTDB_HOST=localhost
QUESTDB_ILP_PORT=9009
QUESTDB_PG_PORT=8812

BACKFILL_START_DATE=2020-01-01
UNDERLYINGS=BTC,ETH
CONCURRENCY=3           # Max parallel symbol streams 
RATE_LIMIT_DELAY_MS=300 # Wait logic between API hits
```

### 3. Execution Commands

**Historical Backfill** (Downloads full history from start date)
```bash
# Full historical backfill
npm run backfill

# Backfill isolated assets
npm run backfill:btc
npm run backfill:eth
```
*(Note: If interrupted, the scraper safely resumes from its last checkpoint.)*

**Daily Nightly Update** (Appends yesterday's UTC data)
```bash
# Sync new instruments, then download yesterday's data
npm run daily-update:sync
```

---

## Analytics & Query Examples

To view your ingested data, open the QuestDB Console ([http://localhost:9000](http://localhost:9000)). 
You can find 13 advanced financial queries in `docs/example-queries.sql`. 

**Example: Finding Data Completeness**
```sql
SELECT symbol, count() AS candles, min(ts), max(ts)
FROM candles
GROUP BY symbol
ORDER BY candles DESC;
```

**Example: Hourly VWAP Aggregation**
```sql
SELECT ts, symbol,
    sum(close * volume) / sum(volume) AS vwap,
    sum(volume) AS total_volume
FROM candles
WHERE symbol = 'C-BTC-50000-261226'
SAMPLE BY 1h ALIGN TO CALENDAR;
```

---

## Troubleshooting

* **Rate limit errors (429):** The script automatically pauses using exponential backoff. If it happens too frequently, increase `RATE_LIMIT_DELAY_MS` in your `.env`.
* **QuestDB Connection Refused:** Ensure QuestDB is actually running and accessible on port `9009` (for data writes) and `8812` (for pg queries).
* **Logs:** The pipeline logs all activities silently to `logs/pipeline.log` and isolates crashes to `logs/error.log`.
