// NSA STOCK SCANNER v1.0.0 - SERENITY-Ω
// Real-time market telemetry. Verified APIs only. Zero mock.

export type QuoteSource = "POLYGON" | "FINNHUB" | "ALPHAVANTAGE" | "YAHOO_V8";

export type P1Signal = {
  vvr: number | null;
  bpi: number | null;
  hgr: number | null;
  ler: number | null;
  mas: number;
  mce: number | null;
  tca: number | null;
  pis: number | null;
  vsa: number;
  sag: number | null;
};

export type P1Inputs = {
  volumeM5: number;
  volumeH1: number;
  txnsM5Buys: number;
  txnsM5Sells: number;
  holdersCurrent: number;
  holders24h: number;
  priceChange5m: number;
  priceChange1h: number;
  priceChange6h: number;
  marketCap: number;
  liquidityUsd: number;
  fdv: number;
  verifiedAge: number;
  holderScarcity: number;
};

export type OHLCV = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Ticker = {
  symbol: string;
  price: number;
  changePct: number;
  volume24h: number;
  marketCap: number;
  p1Score: number;
  surge: number;
  signals: P1Signal;
  metrics: Record<string, any>;
  sources: QuoteSource[];
  tier1: boolean;
};

export type AppState = {
  tickers: Ticker[];
  loading: boolean;
  error: string | null;
  selectedTicker: Ticker | null;
  filter: 'all' | 'tier1';
  sortBy: 'p1' | 'surge' | 'price';
};

export const TOKENS = {
  bg: "#0a0a0f",
  cyan: "#00f0ff",
  neonGlow: "#00ffff",
  green: "#00ff88",
  red: "#ff3366",
  txt: "#e0e0e0",
} as const;
