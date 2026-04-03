'use strict';

const questdb = require('../src/questdb');
const logger = require('../src/logger');

async function main() {
  try {
    logger.info('Wiping old LTP data from QuestDB…');
    await questdb.truncateCandles();
    logger.info('Database is now clean and ready for Mark Price data.');
  } catch (err) {
    logger.error('Failed to truncate candles table', err);
    process.exit(1);
  }
}

main();
