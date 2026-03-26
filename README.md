# Delta India Exchange Data Pipeline

An automated system to collect and store market data from Delta India Exchange.

## Overview

This project automatically gathers price history (Open, High, Low, Close, and Volume) from Delta India Exchange. It is designed to run by itself every few hours and save the information into simple files that you can open in Excel or use for analysis.

## Features

- **Automatic Updates**: The system runs on a schedule without needing your computer to be on.
- **Efficient Saving**: It only downloads new information that hasn't been saved yet.
- **Easy Storage**: Data is saved as CSV files, which are common and easy to use.
- **No Complex Setup**: Designed to work directly on GitHub with minimal configuration.

## Folder Contents

- **data**: This is where the price history is stored.
- **docs**: Contains technical details about how the system is built.
- **fetch_data.py**: The main program that talks to the exchange.
- **.github/workflows**: Instructions for GitHub to run the program automatically.

## Getting Started

1. **Copy the code**: Use the "Clone" or "Download" button on GitHub.
2. **Setup**: If you are a developer, install the requirements using `pip install -r requirements.txt`.
3. **Automate**: Upload this to your own GitHub account to start the automatic updates.

## GitHub Configuration

To make the updates work automatically, you may need to add your API Key and Secret from Delta Exchange into your GitHub repository settings under "Secrets".

## Technical Documentation

- [High-Level Design](docs/HLD.md)
- [Low-Level Design](docs/LLD.md)

## License

This project is licensed under the [MIT License](LICENSE). See the LICENSE file for details.

---
Built by [Tushar Bhardwaj](https://minianonlink.vercel.app/tusharbhardwaj)
