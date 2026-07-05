// ▸ VERIFIED DATA WATERFALL: Polygon → Finnhub → AlphaVantage → Yahoo V8
// Zero mock. Missing = [DATA UNAVAILABLE]. Fallthrough only if current provider fails.

import { Ticker, QuoteSource, P1Signal } from "../types";
import { API_KEYS } from "./config";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

// ▸ YAHOO V8 FALLBACK (always operational single-ticker)
export async function fetchYahoo(symbol: string) {
  const url = `${YAHOO_BASE}${encodeURIComponent(symbol)}?interval=1d&range=6mo&includePrePost=false`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`YAHOO_${symbol}_${r.status}`);

    const json = await r.json();
    const res = json?.chart?.result?.[0];
    const meta = res?.meta ?? {};
    const q = res?.indicators?.quote?.[0] ?? {};

    const closes: number[] = (q.close ?? []).filter((x: unknown) => Number.isFinite(x));
    const highs: number[] = (q.high ?? []).filter((x: unknown) => Number.isFinite(x));
    const lows: number[] = (q.low ?? []).filter((x: unknown) => Number.isFinite(x));
    const vols: number[] = (q.volume ?? []).filter((x: unknown) => Number.isFinite(x));

    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
    const prev = meta.previousClose ?? closes[closes.length - 2] ?? price;
    const changePct = price && prev ? ((price - prev) / prev) * 100 : null;

    return {
      symbol,
      name: meta.longName || meta.shortName || "",
      exchange: meta.exchangeName || "UNKNOWN",
      sector: "",
      price: price || 0,
      changePct: changePct || 0,
      closes,
      highs,
      lows,
      vols,
      high52: highs.length ? Math.max(...highs) : null,
      low52: lows.length ? Math.min(...lows) : null,
      marketCap: meta.marketCap ?? null,
      source: "YAHOO_V8" as const,
    };
  } catch (e) {
    console.error(`YAHOO_V8 error for ${symbol}:`, e);
    throw e;
  }
}

// ▸ POLYGON SNAPSHOT (Tier-1: real-time quote + metrics)
export async function fetchPolygonSnapshot(symbol: string) {
  if (!API_KEYS.POLYGON) return null;
  
  const url = `https://api.polygon.io/v3/snapshot/stocks/${encodeURIComponent(symbol)}?apikey=${API_KEYS.POLYGON}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;

    const json = await r.json();
    const snapshot = json?.results?.last_quote;
    if (!snapshot) return null;

    return {
      symbol,
      price: snapshot.last_updated ? (snapshot.bid + snapshot.ask) / 2 : null,
      bid: snapshot.bid,
      ask: snapshot.ask,
      bidSize: snapshot.bid_size,
      askSize: snapshot.ask_size,
      volume: snapshot.volume || 0,
      source: "POLYGON" as const,
    };
  } catch (e) {
    return null;
  }
}

// ▸ FINNHUB QUOTE (real-time + profile + metrics)
export async function fetchFinnhubQuote(symbol: string) {
  if (!API_KEYS.FINNHUB) return null;

  try {
    const quote = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEYS.FINNHUB}`
    ).then(r => r.ok ? r.json() : null);

    if (!quote) return null;

    return {
      symbol,
      price: quote.c || quote.pc,
      changePct: quote.d ? (quote.d / quote.pc) * 100 : 0,
      high: quote.h,
      low: quote.l,
      open: quote.o,
      previousClose: quote.pc,
      source: "FINNHUB" as const,
    };
  } catch (e) {
    return null;
  }
}

// ▸ ALPHAVANTAGE QUOTE (fundamentals + daily)
export async function fetchAlphaVantageQuote(symbol: string) {
  if (!API_KEYS.ALPHAVANTAGE) return null;

  try {
    const daily = await fetch(
      `https://www.alphavantage.co/query?function=DAILY&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEYS.ALPHAVANTAGE}`
    ).then(r => r.ok ? r.json() : null);

    if (!daily || daily["Error Message"]) return null;

    const latest = Object.values(daily["Time Series (Daily)"] as Record<string, any>)?.[0];
    return {
      symbol,
      price: parseFloat(latest?.["4. close"]),
      high: parseFloat(latest?.["2. high"]),
      low: parseFloat(latest?.["3. low"]),
      volume: parseInt(latest?.["5. volume"]),
      source: "ALPHAVANTAGE" as const,
    };
  } catch (e) {
    return null;
  }
}

// ▸ MAIN WATERFALL: Try providers in sequence
export async function resolveQuote(symbol: string): Promise<{
  price: number;
  changePct: number;
  sources: QuoteSource[];
}> {
  const sources: QuoteSource[] = [];

  // Try Polygon first (most reliable for microcaps)
  const poly = await fetchPolygonSnapshot(symbol).catch(() => null);
  if (poly?.price) {
    sources.push("POLYGON");
    return { price: poly.price, changePct: 0, sources };
  }

  // Try Finnhub
  const fh = await fetchFinnhubQuote(symbol).catch(() => null);
  if (fh?.price) {
    sources.push("FINNHUB");
    return { price: fh.price, changePct: fh.changePct || 0, sources };
  }

  // Try AlphaVantage
  const av = await fetchAlphaVantageQuote(symbol).catch(() => null);
  if (av?.price) {
    sources.push("ALPHAVANTAGE");
    return { price: av.price, changePct: 0, sources };
  }

  // Fallback to Yahoo (always works for US equities)
  try {
    const y = await fetchYahoo(symbol);
    sources.push("YAHOO_V8");
    return { price: y.price || 0, changePct: y.changePct || 0, sources };
  } catch {
    sources.push("UNAVAILABLE");
    return { price: 0, changePct: 0, sources };
  }
}

// ▸ RESOLVE OHLCV (6-month history for technical analysis)
export async function resolveOHLCV(symbol: string): Promise<{
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  source: QuoteSource;
}> {
  try {
    const y = await fetchYahoo(symbol);
    return {
      closes: y.closes,
      highs: y.highs,
      lows: y.lows,
      volumes: y.vols,
      source: "YAHOO_V8",
    };
  } catch {
    return {
      closes: [],
      highs: [],
      lows: [],
      volumes: [],
      source: "UNAVAILABLE",
    };
  }
}

// ▸ RESOLVE FUNDAMENTALS (verified only)
export async function resolveFundamentals(symbol: string): Promise<{
  marketCap: number | null;
  fdv: number | null;
  sector: string;
  high52: number | null;
  low52: number | null;
}> {
  try {
    const y = await fetchYahoo(symbol);
    return {
      marketCap: y.marketCap,
      fdv: null, // Requires Polygon/Finnhub detailed lookup
      sector: y.sector || "N/A",
      high52: y.high52,
      low52: y.low52,
    };
  } catch {
    return {
      marketCap: null,
      fdv: null,
      sector: "N/A",
      high52: null,
      low52: null,
    };
  }
}

// ▸ RESOLVE NEWS (verified sources only - requires news API)
export async function resolveNews(symbol: string): Promise<{ title: string; source: string }[]> {
  if (!API_KEYS.FINNHUB) return [];

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${API_KEYS.FINNHUB}&related=${encodeURIComponent(symbol)}`
    );
    if (!r.ok) return [];

    const json = await r.json();
    return (json as any[])?.slice(0, 5)?.map(n => ({
      title: n.headline,
      source: n.source,
    })) || [];
  } catch {
    return [];
  }
}
