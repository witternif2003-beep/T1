# NSA STOCK SCANNER v3.0 - AMERICA
## Deep Dive Architecture & Data Design

### PHASE 1: FOUNDATION ANALYSIS

#### Data Integrity Requirements
1. **Verified Data Only** - No synthesis, no assumptions
2. **Multi-Provider Waterfall** - Polygon → Finnhub → AlphaVantage → Yahoo V8 fallback
3. **Error Correction** - Type validation at every step
4. **Data Certification** - Source tagging with confidence levels

#### Core Data Structure

```typescript
// Verified Quote (confirmed data only)
VerifiedQuote = {
  symbol: string,           // Validated ticker symbol
  price: number,            // Current price (verified)
  change5m: number | null,  // Verified or null (no estimates)
  change1h: number | null,
  change24h: number | null,
  volume5m: number | null,
  volume24h: number | null,
  sources: string[],        // Provider trail
  timestamp: ISO8601,       // Data freshness
  confidence: 0-100         // Verification confidence
}

// P1 Signal (threshold-based only)
P1Signal = {
  vvr: number | null,       // Volume Velocity Ratio
  bpi: number | null,       // Buy Pressure Index
  hgr: number | null,       // Holder Growth Rate
  ler: number | null,       // Liquidity Efficiency Ratio
  mas: number,              // Momentum Alignment Score
  mce: number | null,       // Market Cap Efficiency
  tca: number | null,       // Transaction Coordination
  pis: number | null,       // Price Impact Severity
  vsa: number,              // Verified Scarcity Age
  sag: number | null,       // Supply-Attention Gap
  verified: boolean,        // All thresholds passed?
  thresholdsCrossed: number // Count of verified crossings
}

// Tier1 Candidate (triple-gated)
Tier1Candidate = {
  p1Score: number,          // 0-100 composite
  surge: number,            // 0-100 probability
  price: number,            // Must be < $1.00
  tier1: boolean,           // P1≥80 AND surge≥50% AND price<$1.00
  neonGlow: boolean         // UI flag (true only if tier1=true)
}

// Complete Ticker Card
TickerCard = {
  rank: number,             // #1-19
  symbol: string,
  name: string,
  quote: VerifiedQuote,
  p1Signals: P1Signal,
  p1Score: number,
  surge: number,
  tier1: Tier1Candidate,
  
  // Verified Metrics Only
  metrics: {
    imminent: number,       // 0-100
    darkPool: number,       // 0-100
    catalyst: number,       // 0-100
    buyRatio: number,       // 0-1 range
    confidence: number,     // 0-100
    momentum: number,       // 0-100
    riskLevel: string,      // "LOW" | "MEDIUM" | "HIGH"
    dex: string,           // Verified DEX
    contractAddr: string,   // Full address
    contractShort: string   // Truncated
  },
  
  // Data Quality
  dataQuality: {
    allFieldsVerified: boolean,
    missingFields: string[],
    unverifiedEstimates: string[],
    sources: string[]
  }
}
```

#### Validation Rules (STRICT)

1. **Quote Validation**
   - Price must be positive number
   - Volume must be >= 0
   - Change percentages must be ±100 max
   - Timestamp must be recent (< 5 minutes)
   - Confidence must be 0-100

2. **P1 Signal Validation**
   - Each signal value OR null (no 0 defaults)
   - Thresholds: VVR>10, BPI>3, HGR>200, LER<0.05, MAS=3/3, MCE>0.8, TCA>15, PIS>2, VSA>0.1, SAG>5
   - Only count threshold if value exists AND passes
   - Null values = unverified = excluded from count

3. **Tier1 Validation (Triple Gate)**
   - Gate 1: p1Score >= 80 (verified)
   - Gate 2: surge >= 50% (verified)
   - Gate 3: price < 1.00 (verified)
   - All three must pass for tier1=true
   - ONLY tier1=true gets neonGlow=true

4. **Metrics Validation**
   - Imminent: 0-100 range
   - Dark Pool: 0-100 range
   - Catalyst: 0-100 range
   - Buy Ratio: 0-1 range (no values > 1)
   - Confidence: 0-100 range
   - Momentum: 0-100 range
   - Risk Level: enum only (LOW/MEDIUM/HIGH)
   - DEX: validated against known list
   - Contract: length check + format validation

#### Error Correction Strategy

**Level 1: Validation**
- Type checking at every assignment
- Range validation before storage
- Null coalescing (null > missing > invalid)

**Level 2: Correction**
- Round decimals to 2 places
- Clamp out-of-range to boundaries
- Replace invalid with null (not defaults)

**Level 3: Certification**
- Tag each value with source
- Mark unverified fields
- Track confidence score

#### Data Flow

```
User Request
    ↓
Request Validation (symbol, timeframe)
    ↓
Provider 1: Polygon (real-time)
    ├─ Validate response
    ├─ Tag with "POLYGON"
    └─ Success? → Return certified data
    ↓ (if Polygon fails)
Provider 2: Finnhub (reliable alternative)
    ├─ Validate response
    ├─ Tag with "FINNHUB"
    └─ Success? → Return certified data
    ↓ (if Finnhub fails)
Provider 3: AlphaVantage (daily data)
    ├─ Validate response
    ├─ Tag with "ALPHAVANTAGE"
    └─ Success? → Return certified data
    ↓ (if AlphaVantage fails)
Provider 4: Yahoo Finance V8 (always works)
    ├─ Validate response
    ├─ Tag with "YAHOO_V8"
    └─ Return certified data (MUST succeed)
    ↓
Response Certification
    ├─ Mark all fields as verified
    ├─ Set confidence score
    └─ Return to UI
    ↓
UI Rendering
    ├─ Only display verified fields
    ├─ Show "[DATA UNAVAILABLE]" for missing
    └─ Apply tier1 filters
```

#### Confidence Scoring

| Condition | Confidence |
|-----------|-----------|
| All 10 P1 signals verified | 100% |
| 8-9 signals verified | 90% |
| 6-7 signals verified | 75% |
| 4-5 signals verified | 60% |
| 1-3 signals verified | 40% |
| No signals verified | 20% |
| Data from Polygon | +20% |
| Data from Finnhub | +15% |
| Data from AlphaVantage | +10% |
| Data from Yahoo V8 | +5% |

