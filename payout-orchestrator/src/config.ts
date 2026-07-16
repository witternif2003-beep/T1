import 'dotenv/config';

import bs58 from 'bs58';
import { Keypair, PublicKey } from '@solana/web3.js';

export interface OrchestratorConfig {
  rpcEndpoints: string[];
  payer: Keypair;
  recipient: PublicKey;
  mint: PublicKey;
  amount: string;
  schedule: string;
  pauseApiPort: number;
  pauseApiKey: string;
  maxRetries: number;
  minIntervalMs: number;
  auditLogPath: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function parsePayerSecret(raw: string): Keypair {
  try {
    if (raw.trim().startsWith('[')) {
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values) || values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
        throw new Error('JSON keypair must be an array of byte values');
      }
      return Keypair.fromSecretKey(Uint8Array.from(values as number[]));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (error) {
    throw new Error(`PAYER_SECRET_KEY is not a valid base58 or JSON-array keypair: ${String(error)}`);
  }
}

function parsePublicKey(name: string, fallback: string): PublicKey {
  try {
    return new PublicKey(process.env[name]?.trim() || fallback);
  } catch {
    throw new Error(`${name} must be a valid Solana public key`);
  }
}

export function loadConfig(): OrchestratorConfig {
  const primary = process.env.SOLANA_RPC_PRIMARY?.trim() || 'https://api.devnet.solana.com';
  const secondary = process.env.SOLANA_RPC_SECONDARY?.trim() || 'https://api.devnet.solana.com';
  const tertiary = process.env.SOLANA_RPC_TERTIARY?.trim() || '';
  const rpcEndpoints = [...new Set([primary, secondary, tertiary].filter(Boolean))];
  const amount = required('AMOUNT');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount) || Number(amount) <= 0 || !Number.isFinite(Number(amount))) {
    throw new Error('AMOUNT must be a finite positive human-unit decimal');
  }

  return {
    rpcEndpoints,
    payer: parsePayerSecret(required('PAYER_SECRET_KEY')),
    recipient: parsePublicKey('RECIPIENT', 'HrcLRCSvzTeGt5QYAuUzNXdX3ss1zSmnV4NRdB9Zu4VG'),
    mint: parsePublicKey('MINT', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
    amount,
    schedule: process.env.SCHEDULE?.trim() || '*/5 * * * *',
    pauseApiPort: positiveInteger('PAUSE_API_PORT', 8787),
    pauseApiKey: required('PAUSE_API_KEY'),
    maxRetries: positiveInteger('MAX_RETRIES', 3),
    minIntervalMs: positiveInteger('MIN_INTERVAL_SECONDS', 60) * 1000,
    auditLogPath: process.env.AUDIT_LOG_PATH?.trim() || './audit.log',
  };
}
