// ============================================================================
// PHASE 1b: VALIDATION ENGINE
// Deep error correction with 3-level validation
// ============================================================================

import * as Types from './types';

/**
 * LEVEL 1: TYPE VALIDATION
 */

class TypeValidator {
  static validateNumber(value: any, fieldName: string, rule: any): number {
    // Check type
    if (typeof value !== 'number') {
      throw new Types.ValidationError(fieldName, value, 'type', `Expected number, got ${typeof value}`);
    }
    
    // Check NaN/Infinity
    if (!isFinite(value)) {
      throw new Types.ValidationError(fieldName, value, 'finite', `Value must be finite`);
    }
    
    // Check range
    if (rule?.min !== undefined && value < rule.min) {
      throw new Types.ValidationError(fieldName, value, 'min', `Must be >= ${rule.min}`);
    }
    if (rule?.max !== undefined && value > rule.max) {
      throw new Types.ValidationError(fieldName, value, 'max', `Must be <= ${rule.max}`);
    }
    
    return value;
  }

  static validateString(value: any, fieldName: string, rule: any): string {
    if (typeof value !== 'string') {
      throw new Types.ValidationError(fieldName, value, 'type', `Expected string, got ${typeof value}`);
    }
    if (value.length === 0) {
      throw new Types.ValidationError(fieldName, value, 'empty', `String cannot be empty`);
    }
    if (rule?.maxLength && value.length > rule.maxLength) {
      throw new Types.ValidationError(fieldName, value, 'maxLength', `Must be <= ${rule.maxLength} chars`);
    }
    return value;
  }

  static validateEnum<T extends string>(value: any, fieldName: string, allowedValues: readonly T[]): T {
    if (!allowedValues.includes(value as T)) {
      throw new Types.ValidationError(
        fieldName,
        value,
        'enum',
        `Must be one of: ${allowedValues.join(', ')}`
      );
    }
    return value as T;
  }

  static validateArray(value: any, fieldName: string): any[] {
    if (!Array.isArray(value)) {
      throw new Types.ValidationError(fieldName, value, 'type', `Expected array, got ${typeof value}`);
    }
    return value;
  }

  static validateBoolean(value: any, fieldName: string): boolean {
    if (typeof value !== 'boolean') {
      throw new Types.ValidationError(fieldName, value, 'type', `Expected boolean, got ${typeof value}`);
    }
    return value;
  }
}

/**
 * LEVEL 2: DATA VALIDATION
 */

class DataValidator {
  static validateQuote(data: any): Types.VerifiedQuote {
    const errors: string[] = [];

    try {
      const symbol = TypeValidator.validateString(data.symbol, 'quote.symbol', { maxLength: 10 });
      const price = TypeValidator.validateNumber(data.price, 'quote.price', {
        min: Types.VALIDATION_RULES.quote.price.min,
        max: Types.VALIDATION_RULES.quote.price.max
      });

      // Optional fields - validate if present
      const change5m = data.change5m !== null && data.change5m !== undefined
        ? TypeValidator.validateNumber(data.change5m, 'quote.change5m', Types.VALIDATION_RULES.quote.change)
        : null;

      const change1h = data.change1h !== null && data.change1h !== undefined
        ? TypeValidator.validateNumber(data.change1h, 'quote.change1h', Types.VALIDATION_RULES.quote.change)
        : null;

      const change24h = data.change24h !== null && data.change24h !== undefined
        ? TypeValidator.validateNumber(data.change24h, 'quote.change24h', Types.VALIDATION_RULES.quote.change)
        : null;

      const volume5m = data.volume5m !== null && data.volume5m !== undefined
        ? TypeValidator.validateNumber(data.volume5m, 'quote.volume5m', Types.VALIDATION_RULES.quote.volume)
        : null;

      const volume24h = data.volume24h !== null && data.volume24h !== undefined
        ? TypeValidator.validateNumber(data.volume24h, 'quote.volume24h', Types.VALIDATION_RULES.quote.volume)
        : null;

      const sources = TypeValidator.validateArray(data.sources || [], 'quote.sources');
      const confidence = TypeValidator.validateNumber(data.confidence || 50, 'quote.confidence', {
        min: 0,
        max: 100
      });

      const timestamp = new Date().toISOString();

      return {
        symbol,
        price,
        change5m,
        change1h,
        change24h,
        volume5m,
        volume24h,
        liquidity: data.liquidity || null,
        marketCap: data.marketCap || null,
        fdv: data.fdv || null,
        sources,
        timestamp,
        confidence
      };
    } catch (err) {
      if (err instanceof Types.ValidationError) throw err;
      throw new Error(`Quote validation failed: ${err}`);
    }
  }

  static validateP1Signal(data: any): Types.P1Signal {
    try {
      const signals = {
        vvr: this.validateSignalValue(data.vvr, 'vvr', Types.VALIDATION_RULES.p1Signal.vvr.threshold),
        bpi: this.validateSignalValue(data.bpi, 'bpi', Types.VALIDATION_RULES.p1Signal.bpi.threshold),
        hgr: this.validateSignalValue(data.hgr, 'hgr', Types.VALIDATION_RULES.p1Signal.hgr.threshold),
        ler: this.validateSignalValue(data.ler, 'ler', Types.VALIDATION_RULES.p1Signal.ler.threshold, 'less'),
        mas: TypeValidator.validateNumber(data.mas || 0, 'p1.mas', { min: 0, max: 3 }),
        mce: this.validateSignalValue(data.mce, 'mce', Types.VALIDATION_RULES.p1Signal.mce.threshold),
        tca: this.validateSignalValue(data.tca, 'tca', Types.VALIDATION_RULES.p1Signal.tca.threshold),
        pis: this.validateSignalValue(data.pis, 'pis', Types.VALIDATION_RULES.p1Signal.pis.threshold),
        vsa: TypeValidator.validateNumber(data.vsa || 0, 'p1.vsa', { min: 0, max: 1 }),
        sag: this.validateSignalValue(data.sag, 'sag', Types.VALIDATION_RULES.p1Signal.sag.threshold)
      };

      // Count thresholds crossed
      const thresholdsCrossed = this.countThresholds(signals, data);
      const verified = thresholdsCrossed >= 5; // At least 5 signals verified

      return {
        ...signals,
        thresholdsCrossed,
        verified,
        verificationSources: data.verificationSources || []
      };
    } catch (err) {
      if (err instanceof Types.ValidationError) throw err;
      throw new Error(`P1 signal validation failed: ${err}`);
    }
  }

  static validateTier1(p1Score: number, surge: number, price: number): Types.Tier1Candidate {
    const gate1 = p1Score >= Types.VALIDATION_RULES.tier1.p1Score.min;
    const gate2 = surge >= Types.VALIDATION_RULES.tier1.surge.min;
    const gate3 = price < Types.VALIDATION_RULES.tier1.price.max;
    const tier1 = gate1 && gate2 && gate3;

    return {
      p1Score: Math.min(100, Math.max(0, p1Score)),
      surge: Math.min(100, Math.max(0, surge)),
      price,
      tier1,
      neonGlow: tier1, // ONLY true if all gates pass
      gatePasses: {
        gate1_p1Score: gate1,
        gate2_surge: gate2,
        gate3_price: gate3
      }
    };
  }

  private static validateSignalValue(
    value: any,
    fieldName: string,
    threshold: number,
    comparison: 'greater' | 'less' = 'greater'
  ): number | null {
    if (value === null || value === undefined) return null;
    
    const num = TypeValidator.validateNumber(value, `p1.${fieldName}`, {});
    
    // Only return if threshold passed
    if (comparison === 'greater') {
      return num > threshold ? num : null;
    } else {
      return num < threshold ? num : null;
    }
  }

  private static countThresholds(signals: any, data: any): number {
    let count = 0;
    
    if (signals.vvr !== null) count++;
    if (signals.bpi !== null) count++;
    if (signals.hgr !== null) count++;
    if (signals.ler !== null) count++;
    if (data.mas === 3) count++; // All 3 timeframes aligned
    if (signals.mce !== null) count++;
    if (signals.tca !== null) count++;
    if (signals.pis !== null) count++;
    if (data.vsa > 0.1) count++;
    if (signals.sag !== null) count++;
    
    return Math.min(count, 10); // Cap at 10 signals
  }
}

/**
 * LEVEL 3: ERROR CORRECTION
 */

class ErrorCorrection {
  static roundToDecimals(value: number, decimals: number = 2): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  static clampRange(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  static sanitizePercentage(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number') return null;
    if (!isFinite(value)) return null;
    return this.clampRange(value, 0, 100);
  }

  static sanitizeRatio(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number') return null;
    if (!isFinite(value)) return null;
    return this.clampRange(value, 0, 1);
  }

  static sanitizeRiskLevel(value: any): string {
    if (!Types.API_CONFIG.riskLevels.includes(value)) {
      return 'MEDIUM'; // Default safe level
    }
    return value;
  }
}

/**
 * EXPORTS
 */

export { TypeValidator, DataValidator, ErrorCorrection };
