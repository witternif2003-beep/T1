import {
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import type { OrchestratorConfig } from './config.js';
import { AuditLogger, type AuditEntry } from './audit-log.js';
import { log } from './logger.js';
import { RpcRouter } from './rpc-router.js';

export interface PayoutResult {
  status: 'confirmed' | 'dead-letter';
  signature: string | null;
  rpc: string | null;
  attemptCount: number;
  error?: string;
  audit: AuditEntry;
}

const U64_MAX = (1n << 64n) - 1n;

function rawAmount(value: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > decimals && fraction.slice(decimals).replace(/0/g, '').length > 0) {
    throw new Error(`AMOUNT has more than ${decimals} decimal places`);
  }
  const raw = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '') || '0');
  if (raw <= 0n || raw > U64_MAX) throw new Error('AMOUNT is outside the SPL u64 range');
  return raw;
}

function backoff(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.min(1000 * (2 ** (attempt - 1)), 8000)));
}

export class PayoutEngine {
  public constructor(
    private readonly config: OrchestratorConfig,
    private readonly router: RpcRouter,
    private readonly audit: AuditLogger,
  ) {}

  public async runOnce(): Promise<PayoutResult> {
    let lastError = 'Payout failed';
    let lastRpc: string | null = null;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const result = await this.router.run(async (connection, rpc) => {
          lastRpc = rpc;
          const mintInfo = await getMint(connection, this.config.mint, 'confirmed', TOKEN_PROGRAM_ID);
          const amount = rawAmount(this.config.amount, mintInfo.decimals);
          const senderAta = await getAssociatedTokenAddress(this.config.mint, this.config.payer.publicKey);
          const recipientAta = await getAssociatedTokenAddress(this.config.mint, this.config.recipient);
          const transaction = new Transaction();
          if (!(await connection.getAccountInfo(recipientAta, 'confirmed'))) {
            transaction.add(createAssociatedTokenAccountInstruction(
              this.config.payer.publicKey,
              recipientAta,
              this.config.recipient,
              this.config.mint,
              TOKEN_PROGRAM_ID,
            ));
          }
          transaction.add(createTransferCheckedInstruction(
            senderAta,
            this.config.mint,
            recipientAta,
            this.config.payer.publicKey,
            amount,
            mintInfo.decimals,
            [],
            TOKEN_PROGRAM_ID,
          ));
          const latest = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = latest.blockhash;
          transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
          transaction.feePayer = this.config.payer.publicKey;
          const simulation = await connection.simulateTransaction(transaction);
          if (simulation.value.err) {
            throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
          }
          transaction.sign(this.config.payer);
          const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
          await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
          return { signature, rpc, amount: amount.toString(), decimals: mintInfo.decimals };
        });
        const audit = await this.audit.append({
          timestamp: new Date().toISOString(),
          recipient: this.config.recipient.toBase58(),
          mint: this.config.mint.toBase58(),
          amountHuman: this.config.amount,
          amountRaw: result.amount,
          signature: result.signature,
          status: 'confirmed',
          rpc: result.rpc,
          attemptCount: attempt,
        });
        log('info', 'Payout confirmed', { signature: result.signature, rpc: result.rpc, attempt });
        return { status: 'confirmed', signature: result.signature, rpc: result.rpc, attemptCount: attempt, audit };
      } catch (error) {
        lastError = String(error);
        log('warn', 'Payout attempt failed', { attempt, maxRetries: this.config.maxRetries, error: lastError });
        if (attempt < this.config.maxRetries) await backoff(attempt);
      }
    }
    const audit = await this.audit.append({
      timestamp: new Date().toISOString(),
      recipient: this.config.recipient.toBase58(),
      mint: this.config.mint.toBase58(),
      amountHuman: this.config.amount,
      amountRaw: 'unknown',
      signature: null,
      status: 'dead-letter',
      rpc: lastRpc,
      attemptCount: this.config.maxRetries,
    });
    log('error', 'Payout dead-lettered', { error: lastError });
    return { status: 'dead-letter', signature: null, rpc: lastRpc, attemptCount: this.config.maxRetries, error: lastError, audit };
  }
}
