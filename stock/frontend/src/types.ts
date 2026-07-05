// ▸ NSA STOCK SCANNER v1.0.0 - SERENITY-Ω
// Real-time market telemetry. Verified APIs only. Zero mock. Missing = [DATA UNAVAILABLE]

export type QuoteSource = "POLYGON" | "FINNHUB" | "ALPHAVANTAGE" | "YAHOO_V8" | "UNAVAILABLE";
export type MetricStatus = "VERIFIED" | "DERIVED" | "REQUIRES_PROVIDER";
export type Exchange = "NASDAQ" | "NYSE" | "ARCA" | "BATS" | "MEMX" | "EDGX" | "DARK";
export type TapeType = "BUY" | "SELL" | "DARK";
export type ConnState = "conn" | "poll" | "disc";

// ▸ 10-SIGNAL P1 ENGINE METRICS
export type P1Signal = {
  vvr: number | null;        // Volume Velocity Ratio: volume.m5 / (volume.h1 / 12) | Threshold > 10.0
  bpi: number | null;        // Buy Pressure Index: txns.m5.buys / txns.m5.sells | Threshold > 3.0
  hgr: number | null;        // Holder Growth Rate: (holders.current - holders.24h) / holders.24h | Threshold > 200%
  ler: number | null;        // Liquidity Efficiency Ratio: liquidity.usd / marketCap | Threshold < 0.05
  mas: number;               // Momentum Alignment Score: sum of (1 if price_change > 0 in 5m/1h/6h) | Threshold = 3/3
  mce: number | null;        // Market Cap Efficiency: marketCap / fdv | Threshold > 0.8
  tca: number | null;        // Transaction Coordination Activity: txns.m5 / (txns.h1 / 12) | Threshold > 15
  pis: number | null;        // Price Impact Severity: |priceChange.m5| / (volume.m5 / liquidity.usd) | Threshold > 2.0
  vsa: number;               // Verified + Scarcity Age: (verified ? 1 : 0) * (1 / days_since_launch) | Threshold > 0.1
  sag: number | null;        // Supply-Attention Gap: implied_attention / current_marketCap | Threshold > 5.0
};

// ▸ METRIC MODULE DISPLAY
export type MetricModule = {
  idx: number;
  title: string;
  value: string;
  subtitle: string;
  status: MetricStatus;
};

// ▸ L2 ORDER BOOK
export type LevelRow = { price: number; size: number; total: number };

// ▸ TIME & SALES TAPE
export type TapeRow = {
  id: string;
  time: string;
  price: number;
  size: number;
  exchange: Exchange;
  type: TapeType;
};

// ▸ MAIN TICKER TYPE
export type Ticker = {
  sym: string;
  name: string;
  exchange: Exchange;
  sector: string;
  price: number;
  changePct: number;
  changeAbs: number;
  p1Score: number;           // Final composite P1 score 0-100
  surgeProb: number;         // Surge probability next bell open (%) [threshold >= 50]
  source: QuoteSource;
  companyVerified: boolean;
  metrics: MetricModule[];
  
  // L2 & Tape (structural model only, no synthesis)
  level2: { bids: LevelRow[]; asks: LevelRow[] };
  tape: TapeRow[];
  
  // Catalyst & scores
  catalyst: string;
  catStrength: number;       // 1-10 scale
  
  // Technical
  vwap: number | null;
  ema9: number | null;
  rsi5: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  
  // Fundamentals (verified only)
  high52: number | null;
  low52: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  
  // P1 signals (raw)
  p1Signals: P1Signal;
  
  // Meta
  dataProviders: QuoteSource[];
  lastUpdate: string;
  scanDate: string;
};

// ▸ APP STATE
export type Controls = {
  audio: boolean;
  refresh: boolean;
  tuning: number;
  band: [number, number];
};

export type AppState = {
  tickers: Ticker[];
  selIdx: number | null;
  creds: { active: boolean; key: string };
  ctrls: Controls;
  conn: ConnState;
  lastUpdate: string;
  scanInProgress: boolean;
};

// ▸ API RESPONSE TYPES
export type ScanResult = {
  symbol: string;
  p1_score: number;
  surge_pct: number;
  catalyst: string;
  pattern: string;
  price: number;
  change_pct: number;
  data_providers: QuoteSource[];
  p1_signals: P1Signal;
  created_at: string;
};

export type HealthResponse = {
  project: string;
  version: string;
  timestamp: string;
};

export type QuoteResponse = Ticker;

// ▸ CONFIG TOKENS
export const TOKENS = {
  bg: "#0a0a0f",
  card: "#111118",
  panel: "#0d0d14",
  cyan: "#00f0ff",
  neonGlow: "#00ffff", // Neon glow light blue for Tier1
  green: "#00ff88",
  red: "#ff3366",
  amber: "#ffaa00",
  txt: "#e0e0e0",
  label: "#8899aa",
  muted: "#556677",
  border: "#1a1a2e",
  glow: "rgba(0,240,255,.15)",
  neonGlowEffect: "rgba(0,255,255,.25)",
} as const;

export const EXCHANGE_COLORS: Record<Exchange, string> = {
  NASDAQ: "#0066ff",
  NYSE: "#ffffff",
  ARCA: "#00f0ff",
  BATS: "#00ff88",
  MEMX: "#ffaa00",
  EDGX: "#ff6600",
  DARK: "#aa00ff",
} as const;
