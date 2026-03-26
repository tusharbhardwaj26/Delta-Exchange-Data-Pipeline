# Low-Level Design (LLD)

## 1. Module Structure

The project consists of a single execution script `fetch_data.py` supported by configuration and dependency files.

### Key Modules:
- `requests`: For HTTP communication with Delta API.
- `pandas`: For data manipulation, merging, and CSV serialization.
- `python-dotenv`: For local environment variable management.

## 2. Core Logic (fetch_data.py)

### `fetch_products()`
- **Endpoint**: `GET /products`
- **Purpose**: Fetches a list of all tradable instruments and their metadata.
- **Storage**: Updates `data/products.csv`.

### `fetch_ohlcv(symbol, resolution)`
- **Endpoint**: `GET /chart/history`
- **Incremental Logic**:
  1. Checks if `data/ohlcv/{symbol}.csv` exists.
  2. If yes, reads the maximum (latest) value from the `time` column.
  3. Sets `start_time` parameter to `max_time + 1`.
  4. Fetches new candles from the API.
  5. Concatenates new data with existing data.
  6. Deduplicates based on the `time` column and sorts.
  7. Writes back to CSV.

## 3. Rate Limiting & Error Handling
- **Sleep**: A 1-second delay is added between ticker requests to stay within API rate limits.
- **Exceptions**: `try-except` blocks wrap API calls and file operations to ensure one failure doesn't stop the entire pipeline.
- **Logging**: Console-based logging provides visibility into the pipeline's progress during GitHub Action execution.

## 4. GitHub Action Workflow Detail

```yaml
on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:
```

- **Retention**: GitHub repository size limits apply, but CSV storage for few symbols is lightweight and scalable for months/years of 1h data.
- **Conflict Handling**: Uses a standard Git commit-push pattern. Since only the bot writes to the `data/` folder, merge conflicts are unlikely.

## 5. Potential Improvements
- Add support for multiple resolutions (1m, 1d) concurrently.
- Implement more robust logging to a dedicated file or external service (e.g., Sentry).
- Add unit tests for the incremental logic and data validation.
