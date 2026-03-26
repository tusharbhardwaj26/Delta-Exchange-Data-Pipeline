# Delta India Exchange Data Pipeline (Automated)

This project is like an automatic diary for the Indian crypto market. It wakes up every few hours, records the latest price movements, and saves them safely in a file so you never miss a thing.

### How It Works (Simplified)
Imagine you have a robot assistant:
1.  **It Wakes Up**: Every 6 hours, your robot assistant automatically checks the Delta India Exchange.
2.  **It Checks the Diary**: It looks at your current files (like `BTC_INR.csv`) to see the last time it wrote something down.
3.  **It Records the Gap**: It asks the exchange for all the "missing" price info since it last checked.
4.  **It Appends and Saves**: It adds these new rows to the bottom of the file and saves them.

**The best part?** You don't have to touch anything. It runs entirely on its own, for free!

---

### Folder Contents

#### 1. data/ohlcv/ (The Price Records)
This is where the real data lives. Each coin (like Bitcoin or Ethereum) has its own file.
*   **1 Row = 1 Hour**: Every line in these files shows exactly what happened in that 1-hour "candle" (the price it started at, its peak, its lowest point, and the final price).
*   **Volume**: It also shows how much was actually traded during that hour.

#### 2. data/products.csv (The Master List)
Think of this as the Master Menu Card of the exchange.
*   It lists over 1,100 coins that you could track.
*   If you ever want to add a new coin to your "diary", you just find its name in this list and add it to the script!

---

### Quick Setup (For Non-Techies)
1.  **Clone the Repo**: Get a copy of this folder.
2.  **Add Your Keys**: Create a small file named `.env` and paste your Delta API Key and Secret inside (like a username and password).
3.  **Push to GitHub**: Once you push this code to your own GitHub account, the "Robot" starts working immediately.

### License
This project is licensed under the MIT License - [License](LICENSE).

---
Built by [Tushar Bhardwaj](https://minianonlink.vercel.app/tusharbhardwaj)

---
Built by [Tushar Bhardwaj](https://minianonlink.vercel.app/tusharbhardwaj)
