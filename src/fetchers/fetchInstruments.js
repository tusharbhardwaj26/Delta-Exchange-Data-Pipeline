'use strict';

const delta = require('../deltaClient');
const sqlite = require('../sqlite');
const config = require('../config');
const logger = require('../logger');

/**
 * Fetch ALL BTC and ETH option contracts from Delta Exchange
 * using cursor-based pagination.
 *
 * Endpoint: GET /v2/products
 * Params:   contract_types=call_options,put_options
 *           states=live,expired
 *
 * @returns {Array<object>} normalized instrument objects
 */
async function fetchAllInstruments() {
  const instruments = [];
  let after = null;
  let page = 1;
  let keepFetching = true;

  logger.info('Starting instrument fetch from Delta Exchange…');

  while (keepFetching) {
    const params = {
      contract_types: 'call_options,put_options',
      states: 'live,expired',
      page_size: 500,
    };
    if (after) params.after = after;

    logger.debug(`Fetching instruments page ${page}`, { after });

    let data;
    try {
      data = await delta.get('/v2/products', params);
    } catch (err) {
      logger.error(`Failed to fetch instruments page ${page}`, { error: err.message });
      break;
    }

    const products = data?.result || [];
    if (products.length === 0) {
      logger.info('No more products — pagination complete');
      keepFetching = false;
      break;
    }

    // ── Filter: only BTC and ETH underlyings ─────────────────────────────────
    const filtered = products.filter((p) =>
      config.pipeline.underlyings.includes(
        (p.underlying_asset?.symbol || p.underlying_asset || '').toUpperCase()
      )
    );

    logger.info(`Page ${page}: ${products.length} total products, ${filtered.length} BTC/ETH options`);

    // ── Normalize ─────────────────────────────────────────────────────────────
    for (const p of filtered) {
      const underlying = (
        p.underlying_asset?.symbol || p.underlying_asset || ''
      ).toUpperCase();

      instruments.push({
        symbol:        p.symbol,
        contract_type: p.contract_type,
        underlying,
        strike_price:  parseFloat(p.strike_price) || null,
        expiry:        p.settlement_time || p.expiry_time || null,
        state:         p.state,
        product_id:    p.id || null,
        description:   p.description || null,
      });
    }

    // ── Pagination cursor ─────────────────────────────────────────────────────
    // Delta API returns pagination info in meta.after or meta.cursor
    const meta = data?.meta || {};
    const nextAfter = meta.after || meta.cursor || null;

    if (!nextAfter || products.length < (params.page_size || 500)) {
      // No next cursor or partial page → last page
      keepFetching = false;
    } else {
      after = nextAfter;
      page++;
    }
  }

  logger.info(`Instrument fetch complete. Total BTC/ETH options: ${instruments.length}`);
  return instruments;
}

/**
 * Fetch instruments and save to SQLite
 */
async function syncInstruments() {
  sqlite.init();
  const instruments = await fetchAllInstruments();

  if (instruments.length === 0) {
    logger.warn('No instruments found — nothing to save');
    return instruments;
  }

  sqlite.upsertInstruments(instruments);

  const counts = sqlite.getCountByUnderlying();
  logger.info('Instruments saved to SQLite:', { counts });

  return instruments;
}

module.exports = { fetchAllInstruments, syncInstruments };
