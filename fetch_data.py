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
SYMBOLS = ["BTCUSD", "ETHUSD", "XRPUSD"]
RESOLUTION = "1h" # In minutes for some APIs, or strings like '1h'

# Delta API Resolutions: '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'
# Convert '1h' to the format expected by /chart/history if necessary

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

def fetch_ohlcv(symbol, resolution):
    print(f"Fetching OHLCV for {symbol} ({resolution})...")
    file_path = os.path.join(OHLCV_DIR, f"{symbol}.csv")
    
    # Load existing data to find start time
    start_time = None
    existing_df = None
    if os.path.exists(file_path):
        try:
            existing_df = pd.read_csv(file_path)
            if not existing_df.empty:
                last_time = existing_df['time'].max()
                start_time = int(last_time) + 1
        except Exception as e:
            print(f"Error reading existing CSV for {symbol}: {e}")

    try:
        # Endpoint: /chart/history?symbol=BTCUSD&resolution=1h
        url = f"{BASE_URL}/chart/history"
        params = {
            "symbol": symbol,
            "resolution": resolution
        }
        if start_time:
            params["start_time"] = start_time
            
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            # Delta /chart/history typically returns { 's': 'ok', 't': [], 'o': [], ... }
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
                print(f"API returned non-ok status for {symbol}: {data.get('s')}")
        else:
            print(f"Error fetching OHLCV for {symbol}: {response.status_code}")
            
    except Exception as e:
        print(f"Exception fetching OHLCV for {symbol}: {e}")

def main():
    ensure_dirs()
    products_df = fetch_products()
    
    # Even if products_df fails, we can try fetching specific symbols
    for symbol in SYMBOLS:
        fetch_ohlcv(symbol, RESOLUTION)
        time.sleep(1)

if __name__ == "__main__":
    main()
