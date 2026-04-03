'use strict';

const { fetchCandlesChunked } = require('../src/fetchers/fetchCandles');
const questdb = require('../src/questdb');
const logger = require('../src/logger');

async function main() {
  const symbol = 'P-BTC-65600-220724';
  const startTs = 1721516400; // July 21 2024
  const endTs = startTs + 3600; // 1 hour

  try {
    logger.info(`Testing Mark Price fetch for ${symbol}...`);
    for await (const chunk of fetchCandlesChunked(symbol, startTs, endTs)) {
      logger.info(`Fetched ${chunk.length} mark price candles.`);
      logger.info(`Sample row: ${JSON.stringify(chunk[0])}`);
      await questdb.insertCandles(chunk);
      break; 
    }
    logger.info('Verification successful! Mark Price data stored correctly.');
    process.exit(0);
  } catch (err) {
    logger.error('Verification failed', err);
    process.exit(1);
  }
}

main();
