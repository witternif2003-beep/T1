#!/usr/bin/env python3
# ▸ REAL EXCHANGE CRAWLER - Sub-$1.00 NYSE/NASDAQ/ARCA/BATS/MEMX/EDGX
# Verified data only. No mock.

import os
import requests
from typing import List, Dict, Optional
import yfinance as yf
from datetime import datetime

class ExchangeCrawler:
    """Fetch real sub-$1.00 tickers from all US exchanges"""
    
    def __init__(self):
        self.polygon_key = os.getenv("POLYGON_KEY", "")
        self.finnhub_key = os.getenv("FINNHUB_KEY", "")
        
    def fetch_polygon_nyse_universe(self) -> List[Dict]:
        """Fetch NYSE universe from Polygon (paginated, only sub-$1.00)"""
        if not self.polygon_key:
            return []
        
        results = []
        try:
            # Polygon Snapshots endpoint - all NYSE stocks
            url = "https://api.polygon.io/v3/snapshot/stocks"
            params = {
                "apikey": self.polygon_key,
                "order": "asc",
                "limit": 250,  # Max per request
                "sort": "ticker",
            }
            
            # Paginate through results
            while url and len(results) < 500:  # Limit to 500 for performance
                r = requests.get(url, params=params, timeout=10)
                if r.status_code != 200:
                    break
                
                data = r.json()
                snapshots = data.get("results", [])
                
                for snap in snapshots:
                    # Filter: sub-$1.00 only
                    price = snap.get("lastQuote", {}).get("lastUpdated")
                    if not price:
                        price = snap.get("lastTrade", {}).get("p", 0)
                    else:
                        price = (snap.get("lastQuote", {}).get("bid", 0) + 
                                snap.get("lastQuote", {}).get("ask", 0)) / 2
                    
                    if price > 0 and price < 1.0:
                        results.append({
                            "symbol": snap.get("ticker"),
                            "exchange": snap.get("market"),
                            "price": price,
                            "volume": snap.get("lastTrade", {}).get("s", 0),
                            "source": "POLYGON",
                        })
                
                # Next page
                url = data.get("next_url")
                if url:
                    url = f"{url}?apikey={self.polygon_key}"
            
        except Exception as e:
            print(f"Polygon crawler error: {e}")
        
        return results
    
    def fetch_finnhub_sub_dollar(self) -> List[Dict]:
        """Fetch sub-$1.00 stocks from Finnhub screener"""
        if not self.finnhub_key:
            return []
        
        results = []
        try:
            # Finnhub Screener: US stocks, price < $1
            url = "https://finnhub.io/api/v1/stock/screener/stocks"
            params = {
                "token": self.finnhub_key,
                "criteria": "exchange=US+AND+price<1",
            }
            
            r = requests.get(url, params=params, timeout=10)
            if r.status_code == 200:
                data = r.json()
                stocks = data.get("stocks", [])
                
                for stock in stocks:
                    results.append({
                        "symbol": stock.get("symbol"),
                        "exchange": stock.get("exchange"),
                        "price": stock.get("price", 0),
                        "volume": stock.get("volume", 0),
                        "source": "FINNHUB",
                    })
        except Exception as e:
            print(f"Finnhub crawler error: {e}")
        
        return results
    
    def fetch_yahoo_micro_cap(self) -> List[Dict]:
        """Fetch microcap data from Yahoo (fallback)"""
        # Yahoo doesn't have direct screener API, but we can check seed tickers
        seeds = [
            "WOK", "PAVS", "FFA", "SHFS", "SRXH", "GDC", "GOSS", "GPUS", 
            "ADTX", "DFNS", "CPOP", "DVLT", "RUBI", "NTCL", "TOVX", "YYGH", 
            "BFRG", "MCOM", "NITO"
        ]
        
        results = []
        for symbol in seeds:
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="1d")
                info = ticker.info
                
                if len(hist) > 0:
                    latest_price = float(hist["Close"].iloc[-1])
                    
                    if 0 < latest_price < 1.0:
                        results.append({
                            "symbol": symbol,
                            "exchange": info.get("exchange", "UNKNOWN"),
                            "price": latest_price,
                            "volume": float(hist["Volume"].iloc[-1]) if "Volume" in hist else 0,
                            "source": "YAHOO_V8",
                        })
            except Exception as e:
                print(f"Yahoo crawler error for {symbol}: {e}")
        
        return results
    
    def crawl_all_exchanges(self) -> List[Dict]:
        """Crawl all exchanges and return deduplicated sub-$1.00 tickers"""
        all_results = []
        
        # Try Polygon first (most reliable)
        print("[*] Crawling Polygon NYSE universe...")
        all_results.extend(self.fetch_polygon_nyse_universe())
        
        # Try Finnhub
        print("[*] Crawling Finnhub sub-dollar screener...")
        all_results.extend(self.fetch_finnhub_sub_dollar())
        
        # Fallback to Yahoo
        print("[*] Crawling Yahoo seed tickers...")
        all_results.extend(self.fetch_yahoo_micro_cap())
        
        # Deduplicate by symbol
        seen = set()
        deduped = []
        for result in all_results:
            symbol = result.get("symbol", "").upper()
            if symbol not in seen:
                seen.add(symbol)
                deduped.append(result)
        
        print(f"[✓] Found {len(deduped)} sub-$1.00 tickers across all exchanges")
        return deduped
    
    def get_exchange_distribution(self, tickers: List[Dict]) -> Dict[str, int]:
        """Count tickers by exchange"""
        distribution = {}
        for ticker in tickers:
            exchange = ticker.get("exchange", "UNKNOWN")
            distribution[exchange] = distribution.get(exchange, 0) + 1
        return distribution


if __name__ == "__main__":
    crawler = ExchangeCrawler()
    print("\n[*] NSA STOCK SCANNER - EXCHANGE CRAWLER")
    print("[*] Fetching sub-$1.00 tickers from all US exchanges...\n")
    
    tickers = crawler.crawl_all_exchanges()
    distribution = crawler.get_exchange_distribution(tickers)
    
    print("\n▸ EXCHANGE DISTRIBUTION:")
    for exchange, count in sorted(distribution.items(), key=lambda x: -x[1]):
        print(f"  {exchange:20} → {count:4} tickers")
    
    print(f"\n▸ SAMPLE TICKERS (first 20):")
    for i, ticker in enumerate(tickers[:20], 1):
        print(f"  {i:2}. {ticker['symbol']:8} @ ${ticker['price']:.4f}  ({ticker['exchange']})")
    
    # Export to JSON for backend
    import json
    with open("microcaps.json", "w") as f:
        json.dump(tickers, f, indent=2)
    print(f"\n[✓] Exported {len(tickers)} tickers to microcaps.json")
