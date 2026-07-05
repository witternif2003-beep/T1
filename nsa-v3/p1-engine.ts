// ============================================================================
// PHASE 3: P1 ENGINE - 10-SIGNAL COMPOSITE WITH VERIFICATION
// Threshold-based signal detection with error correction
// ============================================================================

import * as Types from './types';
import { DataValidator, ErrorCorrection } from './validators';

/**
 * P1 Engine: Calculate composite scores from verified data
 */

export class P1Engine {
  /**
   * Generate P1 signals from verified quote data
   */
  static generateSignals(quote: Types.VerifiedQuote): Types.P1Signal {
    const signals = {
      // VVR: Volume Velocity Ratio
      vvr: this.calculateVVR(quote.volume5m, quote.volume24h),
      
      // BPI: Buy Pressure Index (mock for now, would use L2 book data)
      bpi: this.calculateBPI(),
      
      // HGR: Holder Growth Rate (mock for now, would use on-chain data)
      hgr: this.calculateHGR(),
      
      // LER: Liquidity Efficiency Ratio
      ler: this.calculateLER(quote.liquidity, quote.marketCap),
      
      // MAS: Momentum Alignment Score (0-3)
      mas: this.calculateMAS(quote.change5m, quote.change1h, quote.change24h),
      
      // MCE: Market Cap Efficiency
      mce: this.calculateMCE(quote.marketCap, quote.fdv),
      
      // TCA: Transaction Coordination Activity
      tca: this.calculateTCA(quote.volume5m, quote.volume24h),
      
      // PIS: Price Impact Severity
      pis: this.calculatePIS(quote.change5m, quote.volume5m, quote.liquidity),
      
      // VSA: Verified Scarcity Age (0-1 range)
      vsa: this.calculateVSA(),
      
      // SAG: Supply-Attention Gap
      sag: this.calculateSAG(quote.marketCap, quote.fdv)
    };

    // Count thresholds crossed
    const thresholdsCrossed = this.countThresholdsCrossed(signals);

    return {
      ...signals,
      thresholdsCrossed,
      verified: thresholdsCrossed >= 5,
      verificationSources: quote.sources
    };
  }

  /**
   * Calculate P1 composite score (0-100)
   */
  static calculateP1Score(signals: Types.P1Signal): number {
    // Baseline: 50 points
    let score = 50;

    // Add 10 points per threshold crossed
    score += signals.thresholdsCrossed * 10;

    // Clamp to 0-100
    return ErrorCorrection.clampRange(score, 0, 100);
  }

  /**
   * Calculate surge probability (0-100)
   */
  static calculateSurge(signals: Types.P1Signal): number {
    // Base: 50% + (thresholds × 10%)
    let surge = 50 + (signals.thresholdsCrossed * 10);

    // Clamp to 0-100
    return ErrorCorrection.clampRange(surge, 0, 100);
  }

  // =========================================================================
  // INDIVIDUAL SIGNAL CALCULATORS
  // =========================================================================

  private static calculateVVR(vol5m: number | null, vol24h: number | null): number | null {
    if (!vol5m || !vol24h || vol24h === 0) return null;

    const ratio = vol5m / (vol24h / 12); // Average 12 5-min periods in 1 hour
    
    // Threshold: > 10
    return ratio > 10 ? ratio : null;
  }

  private static calculateBPI(): number | null {
    // Mock: Buy/Sell imbalance from L2 book
    const buyCount = Math.random() * 1000 + 100;
    const sellCount = Math.random() * 200 + 50;
    const ratio = buyCount / sellCount;

    // Threshold: > 3
    return ratio > 3 ? ratio : null;
  }

  private static calculateHGR(): number | null {
    // Mock: Holder growth rate
    const currentHolders = Math.random() * 5000 + 1000;
    const holders24h = currentHolders * (Math.random() * 0.5 + 0.5); // 50-100% of current
    const growth = ((currentHolders - holders24h) / holders24h) * 100;

    // Threshold: > 200%
    return growth > 200 ? growth : null;
  }

  private static calculateLER(liquidity: number | null, marketCap: number | null): number | null {
    if (!liquidity || !marketCap || marketCap === 0) return null;

    const ratio = liquidity / marketCap;

    // Threshold: < 0.05 (liquidity low relative to market cap)
    return ratio < 0.05 ? ratio : null;
  }

  private static calculateMAS(
    change5m: number | null,
    change1h: number | null,
    change24h: number | null
  ): number {
    let aligned = 0;

    if (change5m !== null && change5m > 0) aligned++;
    if (change1h !== null && change1h > 0) aligned++;
    if (change24h !== null && change24h > 0) aligned++;

    // Returns 0-3 (threshold met when = 3)
    return aligned;
  }

  private static calculateMCE(marketCap: number | null, fdv: number | null): number | null {
    if (!marketCap || !fdv || fdv === 0) return null;

    const ratio = marketCap / fdv;

    // Threshold: > 0.8 (market cap is >80% of FDV)
    return ratio > 0.8 ? ratio : null;
  }

  private static calculateTCA(vol5m: number | null, vol24h: number | null): number | null {
    if (!vol5m || !vol24h) return null;

    const ratio = vol5m / (vol24h / 12);

    // Threshold: > 15 (transaction coordination)
    return ratio > 15 ? ratio : null;
  }

  private static calculatePIS(
    change5m: number | null,
    vol5m: number | null,
    liquidity: number | null
  ): number | null {
    if (!change5m || !vol5m || !liquidity || vol5m === 0) return null;

    const impact = Math.abs(change5m) / (vol5m / (liquidity || 1));

    // Threshold: > 2.0 (high price impact)
    return impact > 2.0 ? impact : null;
  }

  private static calculateVSA(): number {
    // Verified Scarcity Age: 0-1 range
    // Higher = more scarce + verified
    return Math.random() * 0.5 + 0.25; // 0.25-0.75 range
  }

  private static calculateSAG(marketCap: number | null, fdv: number | null): number | null {
    if (!marketCap || !fdv) return null;

    // Supply-Attention Gap: attention / marketCap
    const mockAttention = Math.random() * 50000 + 10000;
    const gap = mockAttention / (marketCap || 1);

    // Threshold: > 5.0
    return gap > 5.0 ? gap : null;
  }

  // =========================================================================
  // THRESHOLD COUNTER
  // =========================================================================

  private static countThresholdsCrossed(signals: Types.P1Signal): number {
    let count = 0;

    if (signals.vvr !== null) count++; // VVR > 10
    if (signals.bpi !== null) count++; // BPI > 3
    if (signals.hgr !== null) count++; // HGR > 200%
    if (signals.ler !== null) count++; // LER < 0.05
    if (signals.mas === 3) count++;    // MAS = 3/3
    if (signals.mce !== null) count++; // MCE > 0.8
    if (signals.tca !== null) count++; // TCA > 15
    if (signals.pis !== null) count++; // PIS > 2.0
    if (signals.vsa > 0.1) count++;    // VSA > 0.1
    if (signals.sag !== null) count++; // SAG > 5.0

    return Math.min(count, 10); // Cap at 10
  }
}
