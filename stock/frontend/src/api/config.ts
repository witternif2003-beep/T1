// ▸ API CONFIGURATION - FREE TIER KEYS PRE-CONFIGURED

const env = import.meta.env as Record<string, string>;

// Single standalone deployment URL
export const API_BASE = "https://nsa-stock-scanner.onrender.com";

// FREE TIER API KEYS (no credit card required)
export const API_KEYS = {
  POLYGON: env.VITE_POLYGON_KEY || "PolygonIODemoAPIKey", // Free tier
  FINNHUB: env.VITE_FINNHUB_KEY || "demo", // Free tier
  TWELVEDATA: env.VITE_TWELVEDATA_KEY || "demo", // Free tier
  ALPHAVANTAGE: env.VITE_ALPHAVANTAGE_KEY || "demo", // Free tier
} as const;

export const SUPABASE = {
  URL: env.VITE_SUPABASE_URL || "",
  ANON_KEY: env.VITE_SUPABASE_ANON_KEY || "",
} as const;

export const ENDPOINTS = {
  HEALTH: `${API_BASE}/api/health`,
  PING: `${API_BASE}/api/ping`,
  QUOTE: (symbol: string) => `${API_BASE}/api/quote/${encodeURIComponent(symbol)}`,
  QUOTES: `${API_BASE}/api/quotes`,
  HISTORY: (symbol: string) => `${API_BASE}/api/history/${encodeURIComponent(symbol)}`,
  SCAN: `${API_BASE}/api/scan`,
  KEYS: `${API_BASE}/api/keys`,
} as const;

// ▸ SEED TICKERS - SUB $1.00 NYSE/NASDAQ/ARCA
export const SEED_TICKERS = [
  ["WOK", "NASDAQ"],
  ["PAVS", "NASDAQ"],
  ["FFA", "NYSE"],
  ["SHFS", "NASDAQ"],
  ["SRXH", "NYSE American"],
  ["GDC", "NASDAQ"],
  ["GOSS", "NASDAQ"],
  ["GPUS", "NYSE American"],
  ["ADTX", "OTC"],
  ["DFNS", "NASDAQ"],
  ["CPOP", "NASDAQ"],
  ["DVLT", "NASDAQ"],
  ["RUBI", "NASDAQ"],
  ["NTCL", "NASDAQ"],
  ["TOVX", "NYSE American"],
  ["YYGH", "NASDAQ"],
  ["BFRG", "NASDAQ"],
  ["MCOM", "OTC"],
  ["NITO", "NASDAQ"],
] as const;
