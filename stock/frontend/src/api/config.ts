// API CONFIGURATION - FREE TIER KEYS

const env = import.meta.env as Record<string, string>;

export const API_BASE = "https://nsa-stock-scanner.onrender.com";

export const API_KEYS = {
  POLYGON: "PolygonIODemoAPIKey",
  FINNHUB: "demo",
  TWELVEDATA: "demo",
  ALPHAVANTAGE: "demo",
} as const;

export const ENDPOINTS = {
  HEALTH: `${API_BASE}/api/health`,
  QUOTE: (symbol: string) => `${API_BASE}/api/quote/${encodeURIComponent(symbol)}`,
  QUOTES: `${API_BASE}/api/quotes`,
  HISTORY: (symbol: string) => `${API_BASE}/api/history/${encodeURIComponent(symbol)}`,
  SCAN: `${API_BASE}/api/scan`,
} as const;

export const SEED_TICKERS = [
  "WOK", "PAVS", "FFA", "SHFS", "SRXH", "GDC", "GOSS", "GPUS",
  "MRVL", "NRTI", "CBAK", "TYDE", "CBRL", "RCAT", "DLPN",
  "OCUP", "PBYA", "BITF", "LCID"
];
