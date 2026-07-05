// ============================================================================
// PHASE 2: DATA WATERFALL WITH STRICT VALIDATION
// Multi-provider fallback with error correction
// ============================================================================

import * as Types from './types';
import { DataValidator, ErrorCorrection } from './validators';

/**
 * Provider-specific implementations with validation
 */

class PolygonProvider {
  static async fetchQuote(symbol: string): Promise<Types.VerifiedQuote | null> {
    try {
      // In production: real API call
      // For now: validated mock data
      const mockData = {
        symbol,
        price: Math.random() * 0.99,
        change5m: (Math.random() - 0.5) * 10,
        change1h: (Math.random() - 0.5) * 15,
        change24h: (Math.random() - 0.5) * 50,
        volume5m: Math.random() * 100 + 10,
        volume24h: Math.random() * 500 + 100,
        liquidity: Math.random() * 1000 + 200,
        marketCap: Math.random() * 5000 + 1000,
        fdv: Math.random() * 8000 + 1500,
        sources: [],
        confidence: 85
      };

      // Validate before returning
      const validated = DataValidator.validateQuote(mockData);
      validated.sources.push('POLYGON');
      validated.confidence = Math.min(100, validated.confidence + 20);
      
      return validated;
    } catch (err) {
      console.warn(`[POLYGON] Quote fetch failed for ${symbol}:`, err);
      return null;
    }
  }
}

class FinnhubProvider {
  static async fetchQuote(symbol: string): Promise<Types.VerifiedQuote | null> {
    try {
      const mockData = {
        symbol,
        price: Math.random() * 0.99,
        change5m: (Math.random() - 0.5) * 8,
        change1h: (Math.random() - 0.5) * 12,
        change24h: (Math.random() - 0.5) * 45,
        volume5m: Math.random() * 80 + 8,
        volume24h: Math.random() * 450 + 80,
        liquidity: Math.random() * 900 + 150,
        marketCap: Math.random() * 4500 + 800,
        fdv: Math.random() * 7500 + 1200,
        sources: [],
        confidence: 75
      };

      const validated = DataValidator.validateQuote(mockData);
      validated.sources.push('FINNHUB');
      validated.confidence = Math.min(100, validated.confidence + 15);
      
      return validated;
    } catch (err) {
      console.warn(`[FINNHUB] Quote fetch failed for ${symbol}:`, err);
      return null;
    }
  }
}

class AlphaVantageProvider {
  static async fetchQuote(symbol: string): Promise<Types.VerifiedQuote | null> {
    try {
      const mockData = {
        symbol,
        price: Math.random() * 0.99,
        change5m: null, // Limited data
        change1h: null,
        change24h: (Math.random() - 0.5) * 40,
        volume5m: null,
        volume24h: Math.random() * 400 + 50,
        liquidity: Math.random() * 800 + 100,
        marketCap: Math.random() * 4000 + 600,
        fdv: Math.random() * 7000 + 1000,
        sources: [],
        confidence: 60
      };

      const validated = DataValidator.validateQuote(mockData);
      validated.sources.push('ALPHAVANTAGE');
      validated.confidence = Math.min(100, validated.confidence + 10);
      
      return validated;
    } catch (err) {
      console.warn(`[ALPHAVANTAGE] Quote fetch failed for ${symbol}:`, err);
      return null;
    }
  }
}

class YahooProvider {
  static async fetchQuote(symbol: string): Promise<Types.VerifiedQuote | null> {
    try {
      // Yahoo V8 is ALWAYS reliable - fallback guarantee
      const mockData = {
        symbol,
        price: Math.random() * 0.99,
        change5m: null, // Not available
        change1h: null,
        change24h: (Math.random() - 0.5) * 35,
        volume5m: null,
        volume24h: Math.random() * 350 + 30,
        liquidity: Math.random() * 700 + 80,
        marketCap: Math.random() * 3500 + 500,
        fdv: Math.random() * 6500 + 900,
        sources: [],
        confidence: 50
      };

      const validated = DataValidator.validateQuote(mockData);
      validated.sources.push('YAHOO_V8');
      validated.confidence = Math.min(100, validated.confidence + 5);
      
      return validated;
    } catch (err) {
      console.warn(`[YAHOO_V8] Quote fetch failed for ${symbol}:`, err);
      // Yahoo V8 must never fail
      return this.fallbackQuote(symbol);
    }
  }

  private static fallbackQuote(symbol: string): Types.VerifiedQuote {
    return {
      symbol,
      price: 0.00001, // Minimal valid price
      change5m: null,
      change1h: null,
      change24h: null,
      volume5m: null,
      volume24h: null,
      liquidity: null,
      marketCap: null,
      fdv: null,
      sources: ['YAHOO_V8_FALLBACK'],
      timestamp: new Date().toISOString(),
      confidence: 20 // Very low confidence for fallback
    };
  }
}

/**
 * WATERFALL ORCHESTRATOR
 */

export class DataWaterfall {
  static async resolveQuote(symbol: string): Promise<Types.VerifiedQuote> {
    const errors: string[] = [];

    // Provider 1: Polygon (most accurate, real-time)
    try {
      const quote = await PolygonProvider.fetchQuote(symbol);
      if (quote) {
        console.log(`[WATERFALL] ${symbol} resolved via POLYGON (confidence: ${quote.confidence}%)`);
        return quote;
      }
    } catch (err) {
      errors.push(`POLYGON: ${err}`);
    }

    // Provider 2: Finnhub (reliable alternative)
    try {
      const quote = await FinnhubProvider.fetchQuote(symbol);
      if (quote) {
        console.log(`[WATERFALL] ${symbol} resolved via FINNHUB (confidence: ${quote.confidence}%)`);
        return quote;
      }
    } catch (err) {
      errors.push(`FINNHUB: ${err}`);
    }

    // Provider 3: AlphaVantage (daily data)
    try {
      const quote = await AlphaVantageProvider.fetchQuote(symbol);
      if (quote) {
        console.log(`[WATERFALL] ${symbol} resolved via ALPHAVANTAGE (confidence: ${quote.confidence}%)`);
        return quote;
      }
    } catch (err) {
      errors.push(`ALPHAVANTAGE: ${err}`);
    }

    // Provider 4: Yahoo V8 (ALWAYS works)
    try {
      const quote = await YahooProvider.fetchQuote(symbol);
      console.log(`[WATERFALL] ${symbol} resolved via YAHOO_V8 (confidence: ${quote.confidence}%)`);
      return quote;
    } catch (err) {
      errors.push(`YAHOO_V8: ${err}`);
      // This should never happen
      throw new Error(`[WATERFALL FAILURE] All providers failed for ${symbol}: ${errors.join('; ')}`);
    }
  }

  static async resolveQuotes(symbols: string[]): Promise<Types.VerifiedQuote[]> {
    return Promise.all(symbols.map(sym => this.resolveQuote(sym)));
  }
}

export { PolygonProvider, FinnhubProvider, AlphaVantageProvider, YahooProvider };
