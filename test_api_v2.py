import requests
import pandas as pd

BASE_URL = "https://api.india.delta.exchange"

print("Attempting to fetch assets using requests...")
try:
    response = requests.get(f"{BASE_URL}/v2/assets")
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Successfully fetched {len(data['result'])} assets.")
        print(pd.DataFrame(data['result']).head())
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Error: {e}")
