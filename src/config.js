'use strict';

require('dotenv').config();

const config = {
  delta: {
    baseUrl: process.env.DELTA_BASE_URL || 'https://api.india.delta.exchange',
    apiKey: process.env.DELTA_API_KEY || '',
    apiSecret: process.env.DELTA_API_SECRET || '',
  },

  questdb: {
    host: process.env.QUESTDB_HOST || 'localhost',
    ilpPort: parseInt(process.env.QUESTDB_ILP_PORT || '9009', 10),
    httpPort: parseInt(process.env.QUESTDB_HTTP_PORT || '9000', 10),
    pgPort: parseInt(process.env.QUESTDB_PG_PORT || '8812', 10),
    user: process.env.QUESTDB_USER || 'admin',
    password: process.env.QUESTDB_PASSWORD || 'quest',
    database: process.env.QUESTDB_DB || 'qdb',
  },

  sqlite: {
    path: process.env.SQLITE_PATH || './data/instruments.db',
  },

  pipeline: {
    backfillStartDate: process.env.BACKFILL_START_DATE || '2020-01-01',
    underlyings: (process.env.UNDERLYINGS || 'BTC,ETH').split(',').map(s => s.trim().toUpperCase()),
    resolution: process.env.RESOLUTION || '1m',
    concurrency: parseInt(process.env.CONCURRENCY || '3', 10),
    rateLimitDelayMs: parseInt(process.env.RATE_LIMIT_DELAY_MS || '300', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    // 1-day window in seconds for candle chunking (max ~1440 candles @ 1m resolution)
    chunkSizeSeconds: 86400,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

module.exports = config;
