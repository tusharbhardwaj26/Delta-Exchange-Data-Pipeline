'use strict';

const delta = require('../deltaClient');
const config = require('../config');
const logger = require('../logger');

const CHUNK_SECONDS = config.pipeline.chunkSizeSeconds; // 86400 = 1 day

/**
 * Fetch 1-minute OHLCV candles for a single symbol over a time range.
 * Automatically chunks requests into 1-day windows (max ~1440 candles each).
 *
 * Endpoint: GET /v2/history/candles
 * Params:   symbol, resolution=1m, start, end
 *
 * @param {string}  symbol    - Delta option symbol e.g. "C-BTC-50000-261226"
 * @param {number}  startTs   - Unix seconds (start of range)
 * @param {number}  endTs     - Unix seconds (end of range, exclusive)
 * @returns {AsyncGenerator<Array<object>>} yields arrays of normalized candle rows
 */
async function* fetchCandlesChunked(symbol, startTs, endTs) {
  let chunkStart = startTs;

  // ── FAST FORWARD LOGIC ───────────────────────────────────────────────────
  // Instead of crawling day by day through years of empty history,
  // we first request a 1d resolution to find the exact listing date.
  let timeJump = null;
  try {
    const ffData = await delta.get('/v2/history/candles', {
      symbol: `MARK:${symbol}`,
      resolution: '1d', // 1d allows checking 2000 days in 1 API call!
      start: chunkStart,
      end: endTs,
    });
    const ffCandles = ffData?.result || ffData?.candles || [];
    
    // Find the first candle that was actually returned
    const firstCandle = ffCandles.find((c) => c && c.time);
    if (firstCandle) {
      timeJump = parseInt(firstCandle.time, 10);
      // Fast forward chunkStart to exactly 1 day before the first data point
      chunkStart = Math.max(startTs, timeJump - 86400);
      logger.debug(`${symbol}: Fast-forwarded safely to ${fmtTs(chunkStart)}`);
    } else {
      logger.debug(`${symbol}: No 1d data found across entire range — skipping entirely`);
      return; // No data exists for this contract
    }
  } catch (err) {
    logger.warn(`${symbol}: 1d fast-forward failed, falling back to manual crawl`, { error: err.message });
  }

  // ── STANDARD 1M CRAWLER ──────────────────────────────────────────────────
  let emptyChunks = 0;
  // Increase empty tolerance since we already fast-forwarded to roughly the correct zone
  const MAX_CONSECUTIVE_EMPTY = 15;

  while (chunkStart < endTs) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SECONDS, endTs);

    let data;
    try {
      data = await delta.get('/v2/history/candles', {
        symbol: `MARK:${symbol}`,
        resolution: config.pipeline.resolution,
        start: chunkStart,
        end: chunkEnd,
      });
    } catch (err) {
      logger.error(`Candle fetch error for ${symbol}`, {
        chunkStart,
        chunkEnd,
        error: err.message,
      });
      chunkStart = chunkEnd;
      continue;
    }

    const candles = data?.result || data?.candles || [];

    if (candles.length === 0) {
      emptyChunks++;
      if (emptyChunks >= MAX_CONSECUTIVE_EMPTY) {
        logger.debug(`${symbol}: Hit empty barrier — assuming end of available data.`);
        return;
      }
    } else {
      emptyChunks = 0; // reset on success

      // ── Normalize candle fields ─────────────────────────────────────────────
      // Delta API returns: time (unix s), open, high, low, close, volume
      const rows = candles
        .filter((c) => c && c.time)
        .map((c) => {
          const price = parseFloat(c.close) || 0;
          return {
            time:   parseInt(c.time, 10),
            symbol,
            open:   price,
            high:   price,
            low:    price,
            close:  price,
            volume: 0, // Mark price response from Delta has null volume
          };
        });

      logger.debug(`${symbol}: ${rows.length} candles [${fmtTs(chunkStart)} → ${fmtTs(chunkEnd)}]`);

      if (rows.length > 0) yield rows;
    }

    chunkStart = chunkEnd;
  }
}

/**
 * Format Unix timestamp as readable date string for logging
 */
function fmtTs(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/**
 * Fetch ALL candles for a symbol from startTs to now (one-shot, collects all)
 * Use fetchCandlesChunked for memory-efficient streaming
 *
 * @param {string} symbol
 * @param {number} startTs   - Unix seconds
 * @param {number} endTs     - Unix seconds (defaults to now)
 * @returns {Array<object>}
 */
async function fetchAllCandles(symbol, startTs, endTs = null) {
  const end = endTs || Math.floor(Date.now() / 1000);
  const allCandles = [];

  for await (const chunk of fetchCandlesChunked(symbol, startTs, end)) {
    allCandles.push(...chunk);
  }

  return allCandles;
}

module.exports = { fetchCandlesChunked, fetchAllCandles, fmtTs };
