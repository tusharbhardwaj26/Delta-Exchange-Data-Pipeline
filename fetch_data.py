import os
import pandas as pd
import requests
import datetime
import time
from dotenv import load_dotenv

load_dotenv()

# Configuration
BASE_URL = "https://api.india.delta.exchange/v2"
DATA_DIR = "data"
OHLCV_DIR = os.path.join(DATA_DIR, "ohlcv")

# Delta India primarily uses INR pairs for spot.
# Let's use BTCUSD (if available) and BTC_INR to be safe.
SYMBOLS = ["BTCUSD", "ETHUSD", "XRPUSD", "BTC_INR", "ETH_INR"]
DEFAULT_RESOLUTION = "1h" 

# Delta API Resolutions: '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'
# The /chart/history endpoint expects numerical strings for minutes.
RESOLUTION_MAP = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "1d": "D"
}

def ensure_dirs():
    os.makedirs(OHLCV_DIR, exist_ok=True)

def fetch_products():
    print("Fetching products...")
    try:
        url = f"{BASE_URL}/products"
        response = requests.get(url)
        if response.status_code == 200:
            products = response.json().get('result', [])
            df = pd.DataFrame(products)
            products_path = os.path.join(DATA_DIR, "products.csv")
            df.to_csv(products_path, index=False)
            print(f"Saved {len(df)} products to {products_path}")
            return df
        else:
            print(f"Error fetching products: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Exception fetching products: {e}")
        return None

def fetch_ohlcv(symbol, resolution_str):
    resolution = RESOLUTION_MAP.get(resolution_str, "60")
    print(f"Fetching OHLCV for {symbol} ({resolution_str} -> {resolution})...")
    file_path = os.path.join(OHLCV_DIR, f"{symbol}.csv")
    
    # End time is 'now'
    to_time = int(time.time())
    
    # Start time
    # Default to 30 days ago if no file exists
    start_time = to_time - (30 * 24 * 60 * 60)
    
    existing_df = None
    if os.path.exists(file_path):
        try:
            existing_df = pd.read_csv(file_path)
            if not existing_df.empty:
                # Delta history 't' is usually in seconds
                last_time = existing_df['time'].max()
                start_time = int(last_time) + 1
        except Exception as e:
            print(f"Error reading existing CSV for {symbol}: {e}")

    # Ensure range is valid
    if start_time >= to_time:
        print(f"Data for {symbol} is already up to date.")
        return

    try:
        # Endpoint: /chart/history?symbol=BTCUSD&resolution=60&from=1711478400&to=1711564800
        url = f"{BASE_URL}/chart/history"
        params = {
            "symbol": symbol,
            "resolution": resolution,
            "from": start_time,
            "to": to_time
        }
            
        response = requests.get(url, params=params)
        if response.status_code == 200:
            full_response = response.json()
            # The data is nested inside 'result'
            data = full_response.get('result', {})
            
            if data.get('s') == 'ok':
                new_data = {
                    'time': data.get('t', []),
                    'open': data.get('o', []),
                    'high': data.get('h', []),
                    'low': data.get('l', []),
                    'close': data.get('c', []),
                    'volume': data.get('v', [])
                }
                new_df = pd.DataFrame(new_data)
                
                if not new_df.empty:
                    if existing_df is not None:
                        updated_df = pd.concat([existing_df, new_df]).drop_duplicates(subset=['time']).sort_values('time')
                    else:
                        updated_df = new_df
                    
                    updated_df.to_csv(file_path, index=False)
                    print(f"Updated {symbol}.csv with {len(new_df)} new rows.")
                else:
                    print(f"No new entries for {symbol}.")
            else:
                # Status 'no_data' is common if tokens don't have history in that range
                print(f"API result for {symbol}: {data.get('s')}")
        else:
            print(f"Error fetching OHLCV for {symbol}: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Exception fetching OHLCV for {symbol}: {e}")

def main():
    ensure_dirs()
    fetch_products()
    
    for symbol in SYMBOLS:
        fetch_ohlcv(symbol, DEFAULT_RESOLUTION)
        time.sleep(1)

if __name__ == "__main__":
    main()
