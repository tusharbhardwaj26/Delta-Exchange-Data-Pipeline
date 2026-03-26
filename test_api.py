from delta_rest_client import DeltaRestClient
import pandas as pd

BASE_URL = "https://api.india.delta.exchange"
client = DeltaRestClient(base_url=BASE_URL)

print("Attempting to fetch products...")
try:
    products = client.get_products()
    print(f"Successfully fetched {len(products)} products.")
    print(pd.DataFrame(products).head())
except Exception as e:
    print(f"Error: {e}")
