// ============================================================================
// NSA STOCK SCANNER v3.0 - AMERICA
// Deep Dive Type System with Rigorous Validation
// ============================================================================

/**
 * VALIDATION LAYER 1: Core Data Types
 * Every type includes strict validation rules
 */

// Verified Quote - Only certified data (no estimates)
export interface VerifiedQuote {
  symbol: string;           // Validated ticker
  price: number;            // Current price (>0)
  change5m: number | null;  // Null if unverified
  change1h: number | null;
  change24h: number | null;
  volume5m: number | null;  // Null if unavailable
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  fdv: number | null;       // Fully Diluted Valuation
  sources: string[];        // Provider trail: [POLYGON, FINNHUB, etc]
  timestamp: string;        // ISO 8601
  confidence: number;       // 0-100
}

// P1 Signal - Threshold-based detection
export interface P1Signal {
  vvr: number | null;       // Volume Velocity Ratio (threshold: >10)
  bpi: number | null;       // Buy Pressure Index (threshold: >3)
  hgr: number | null;       // Holder Growth Rate (threshold: >200%)
  ler: number | null;       // Liquidity Efficiency (threshold: <0.05)
  mas: number;              // Momentum Alignment (0-3, threshold: =3)
  mce: number | null;       // Market Cap Efficiency (threshold: >0.8)
  tca: number | null;       // Transaction Coordination (threshold: >15)
  pis: number | null;       // Price Impact Severity (threshold: >2.0)
  vsa: number;              // Verified Scarcity Age (threshold: >0.1)
  sag: number | null;       // Supply-Attention Gap (threshold: >5.0)
  
  // Verification metadata
  thresholdsCrossed: number; // Count of verified thresholds
  verified: boolean;        // All available signals passed?
  verificationSources: string[];
}

// Tier1 Candidate - Triple-gated
export interface Tier1Candidate {
  p1Score: number;          // 0-100 composite
  surge: number;            // 0-100 probability
  price: number;            // Must verify < $1.00
  tier1: boolean;           // P1≥80 AND surge≥50% AND price<$1.00
  neonGlow: boolean;        // UI flag (ONLY if tier1=true)
  gatePasses: {
    gate1_p1Score: boolean; // p1Score >= 80
    gate2_surge: boolean;   // surge >= 50
    gate3_price: boolean;   // price < 1.00
  };
}

// Comprehensive Metrics
export interface TickerMetrics {
  imminent: number;         // 0-100 (verified)
  darkPool: number;         // 0-100 (verified)
  catalyst: number;         // 0-100 (verified)
  buyRatio: number;         // 0-1 range (verified)
  confidence: number;       // 0-100 (verified)
  momentum: number;         // 0-100 (verified)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; // Enum only
  dex: string;             // Validated DEX
  contractAddr: string;     // Full address
  contractShort: string;    // Truncated
  volumeSpikeRatio: number; // 0-100
  priceDelta5m: number;     // Absolute change
}

// Data Quality Tracking
export interface DataQuality {
  allFieldsVerified: boolean;
  missingFields: string[];
  unverifiedEstimates: string[];
  sources: string[];
  verificationTimestamp: string;
  confidenceScore: number;
}

// Complete Ticker Card
export interface TickerCard {
  rank: number;             // #1-19
  symbol: string;
  name: string;
  
  // Data sections
  quote: VerifiedQuote;
  p1Signals: P1Signal;
  metrics: TickerMetrics;
  tier1: Tier1Candidate;
  dataQuality: DataQuality;
  
  // Computed properties
  p1Score: number;          // 0-100
  surge: number;            // 0-100
}

/**
 * VALIDATION LAYER 2: Validation Rules
 */

export const VALIDATION_RULES = {
  quote: {
    price: { min: 0.00000001, max: 1000 },
    volume: { min: 0, max: Number.MAX_SAFE_INTEGER },
    change: { min: -100, max: 100 },
    confidence: { min: 0, max: 100 },
    timestamp: { maxAge: 300000 } // 5 minutes
  },
  p1Signal: {
    vvr: { threshold: 10 },
    bpi: { threshold: 3 },
    hgr: { threshold: 200 },
    ler: { threshold: 0.05, comparison: 'less' },
    mas: { threshold: 3 },
    mce: { threshold: 0.8 },
    tca: { threshold: 15 },
    pis: { threshold: 2.0 },
    vsa: { threshold: 0.1 },
    sag: { threshold: 5.0 }
  },
  tier1: {
    p1Score: { min: 80, max: 100 },
    surge: { min: 50, max: 100 },
    price: { min: 0, max: 0.99 }
  },
  metrics: {
    percentage: { min: 0, max: 100 },
    ratio: { min: 0, max: 1 },
    riskLevels: ['LOW', 'MEDIUM', 'HIGH']
  }
} as const;

/**
 * VALIDATION LAYER 3: Error Types
 */

export class ValidationError extends Error {
  constructor(
    public field: string,
    public value: any,
    public rule: string,
    message: string
  ) {
    super(`[${field}] ${message}`);
    this.name = 'ValidationError';
  }
}

export class DataUnavailableError extends Error {
  constructor(
    public symbol: string,
    public field: string
  ) {
    super(`[${symbol}.${field}] Data unavailable from all providers`);
    this.name = 'DataUnavailableError';
  }
}

/**
 * VALIDATION LAYER 4: Type Guards
 */

export function isVerifiedQuote(obj: any): obj is VerifiedQuote {
  return (
    typeof obj.symbol === 'string' &&
    typeof obj.price === 'number' &&
    Array.isArray(obj.sources) &&
    typeof obj.confidence === 'number' &&
    obj.confidence >= 0 && obj.confidence <= 100
  );
}

export function isP1Signal(obj: any): obj is P1Signal {
  return (
    typeof obj.mas === 'number' &&
    typeof obj.vsa === 'number' &&
    typeof obj.thresholdsCrossed === 'number' &&
    typeof obj.verified === 'boolean'
  );
}

export function isTier1Candidate(obj: any): obj is Tier1Candidate {
  return (
    typeof obj.p1Score === 'number' &&
    typeof obj.surge === 'number' &&
    typeof obj.price === 'number' &&
    typeof obj.tier1 === 'boolean' &&
    typeof obj.neonGlow === 'boolean'
  );
}

/**
 * APP STATE
 */

export interface AppState {
  tickers: TickerCard[];
  loading: boolean;
  error: string | null;
  selectedTicker: TickerCard | null;
  filter: 'all' | 'tier1';
  sortBy: 'p1' | 'surge' | 'price' | 'rank';
  scanTime: number;
  tier1Count: number;
}

/**
 * SEED TICKERS (Verified sub-$1.00 NYSE/NASDAQ)
 */

export const SEED_TICKERS = [
  'WOK', 'PAVS', 'FFA', 'SHFS', 'SRXH', 'GDC', 'GOSS', 'GPUS',
  'MRVL', 'NRTI', 'CBAK', 'TYDE', 'CBRL', 'RCAT', 'DLPN',
  'OCUP', 'PBYA', 'BITF', 'LCID'
] as const;

/**
 * API CONFIGURATION
 */

export const API_CONFIG = {
  baseUrl: 'https://nsa-stock-scanner.onrender.com',
  timeout: 5000,
  retries: 3,
  providers: ['POLYGON', 'FINNHUB', 'ALPHAVANTAGE', 'YAHOO_V8'],
  dexes: ['raydium', 'orca', 'marinade', 'step', 'lifinity'],
  riskLevels: ['LOW', 'MEDIUM', 'HIGH']
} as const;
