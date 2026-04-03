'use strict';

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

async function exportSample() {
  const client = new Client({
    host: config.questdb.host,
    port: config.questdb.pgPort,
    user: config.questdb.user,
    password: config.questdb.password,
    database: config.questdb.database,
  });

  try {
    await client.connect();
    console.log('Connected to QuestDB.');

    // Query 1: Get total candle count to show the user true DB progress
    const countRes = await client.query('SELECT count() as cnt FROM candles');
    console.log(`Total candles currently in QuestDB: ${countRes.rows[0].cnt}`);

    // Query 2: Extract a specific heavily traded symbol we just saw in the logs
    const targetSymbol = 'P-BTC-65600-220724';
    console.log(`Extracting data for ${targetSymbol}...`);
    
    let res = await client.query(`SELECT ts, symbol, open, high, low, close, volume FROM candles WHERE symbol = $1 ORDER BY ts ASC LIMIT 10000`, [targetSymbol]);

    if (res.rows.length === 0) {
        console.log(`No data for ${targetSymbol}, falling back to a general sample of active candles...`);
        res = await client.query(`SELECT ts, symbol, open, high, low, close, volume FROM candles WHERE volume > 0 LIMIT 5000`);
    }

    if (res.rows.length === 0) {
        console.log('No data found in QuestDB to export yet.');
        return;
    }

    // Convert to CSV
    const headers = 'timestamp,symbol,open,high,low,close,volume';
    const lines = res.rows.map(r => {
      // Map timestamps properly to strings
      const tsStr = r.ts instanceof Date ? r.ts.toISOString() : r.ts;
      return `${tsStr},${r.symbol},${r.open},${r.high},${r.low},${r.close},${r.volume}`;
    });

    const outPath = path.resolve(__dirname, '../data_validation_sample.csv');
    fs.writeFileSync(outPath, [headers, ...lines].join('\n'));

    console.log(`\n✅ SUCCESS! Exported ${res.rows.length} rows to: ${outPath}`);
    console.log('Share this file with your teammate for validation.');

  } catch (err) {
    console.error('Failed to export data:', err);
  } finally {
    await client.end();
  }
}

exportSample();
