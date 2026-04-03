'use strict';

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

// ─── Axios instance ────────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: config.delta.baseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ─── Retry helper ──────────────────────────────────────────────────────────────
/**
 * Sleep for ms milliseconds
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff: 1s, 2s, 4s
 */
const backoffDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000);

/**
 * GET request with automatic retry + 429 handling
 * @param {string} path  - e.g. '/v2/products'
 * @param {object} params - query params
 * @param {number} attempt - internal retry counter
 * @returns {object} response.data
 */
async function get(path, params = {}, attempt = 0) {
  try {
    // Rate limit courtesy delay
    if (config.pipeline.rateLimitDelayMs > 0) {
      await sleep(config.pipeline.rateLimitDelayMs);
    }

    const response = await client.get(path, { params });
    return response.data;

  } catch (err) {
    const status = err.response?.status;
    const retryAfter = err.response?.headers?.['retry-after'];

    // ── 429 Rate Limited ──────────────────────────────────────────────────────
    if (status === 429) {
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffDelay(attempt);
      logger.warn(`Rate limited on ${path}. Waiting ${waitMs}ms before retry…`, { attempt });
      await sleep(waitMs);
      return get(path, params, attempt + 1);
    }

    // ── Retryable errors (5xx, network) ───────────────────────────────────────
    if (attempt < config.pipeline.maxRetries && (status >= 500 || !status)) {
      const waitMs = backoffDelay(attempt);
      logger.warn(`Request failed for ${path} (status=${status || 'network'}). Retrying in ${waitMs}ms…`, { attempt });
      await sleep(waitMs);
      return get(path, params, attempt + 1);
    }

    // ── Non-retryable ─────────────────────────────────────────────────────────
    logger.error(`Request permanently failed: ${path}`, {
      status,
      message: err.message,
      params,
    });
    throw err;
  }
}

module.exports = { get };
