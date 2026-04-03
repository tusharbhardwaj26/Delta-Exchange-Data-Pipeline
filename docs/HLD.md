# High-Level Design (HLD): BTC/ETH Options Data Pipeline

## 1. Introduction
The purpose of this document is to outline the architecture of the production-grade data pipeline used to fetch, store, and backfill historical 1-minute OHLCV candle data for BTC and ETH options via the Delta Exchange API. 

## 2. System Architecture

The overarching system is designed asynchronously to maximize throughput while avoiding API rate limitations. It separates time-series storage (QuestDB) from metadata registry storage (SQLite).

### 2.1 Component Interaction

```mermaid
flowchart TD
    subgraph Data Sources
      A[Delta Exchange API]
    end
    
    subgraph Core Pipeline (Node.js)
      B[fetchInstruments Module]
      C[fetchCandles Module]
      D[Process Pipeline Backfill/Daily]
    end
    
    subgraph Persistence Layer
      E[(SQLite Database)]
      F[(QuestDB Database)]
    end
    
    A <-->|HTTP Requests| B
    A <-->|HTTP Requests| C
    
    B -->|Persist Metadata| E
    D -->|Coordinate| B
    D -->|Iterate Instruments| E
    D -->|Coordinate| C
    
    C -->|Flush ILP Batches| F
```

## 3. Data Flow

1. **Initialization:** The system fetches all option contracts (live and expired) using cursor pagination from Delta Exchange (`GET /v2/products`).
2. **Metadata Storage:** Contract metadata (such as strike price, active state, expiration date) is written locally using `better-sqlite3` to prevent overhead on our time-series DB.
3. **Execution Loop:** A concurrency throttler (`p-limit`) launches multiple async fetching loops querying `GET /v2/history/candles` for assigned symbols in one-day chunks.
4. **Time-series Ingestion:** Raw fetched arrays are converted into nanosecond format and piped asynchronously via isolated **HTTP Senders** over the Influx Line Protocol (ILP) using `@questdb/nodejs-client` to QuestDB, safely preventing backpressure loops and TCP stream interlacing.

## 4. Key Design Decisions

* **Database Strategy:** Utilizing QuestDB explicitly for time-series and volume indexing prevents standard SQL (PostgreSQL or MySQL) indexing bottlenecks as datasets expand into billions of rows.
* **Fast-Forward Engine:** Pre-fetches 1D resolution data to identify the exact initial listing date of highly illiquid options, completely bypassing millions of dead-air API calls for empty historic bounds.
* **Idempotency Strategy:** Utilizing QuestDB `UPSERT DEDUP KEYS (ts, symbol)` means the system can intentionally over-fetch data near boundaries without duplicating records. We process overlapping sets cleanly.
* **Resiliency Layers:** The `deltaClient` utilizes `axios` alongside intelligent exception catching reading `retry-after` header fields returning `429 Too Many Requests`. This prevents system crash during high pipeline saturation.
