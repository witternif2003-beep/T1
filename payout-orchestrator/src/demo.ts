import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import bs58 from 'bs58';
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

import { loadConfig } from './config.js';
import { log } from './logger.js';
import { OrchestratorService } from './service.js';

const recipient = 'HrcLRCSvzTeGt5QYAuUzNXdX3ss1zSmnV4NRdB9Zu4VG';
const rpcUrls = [
  process.env.SOLANA_RPC_PRIMARY?.trim() || clusterApiUrl('devnet'),
  process.env.SOLANA_RPC_SECONDARY?.trim() || 'https://api.devnet.solana.com',
  process.env.SOLANA_RPC_TERTIARY?.trim() || '',
].filter(Boolean);
const auditPath = './demo-audit.log';
const apiKey = `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function rpcConnections(): Promise<Connection[]> {
  const connections = rpcUrls.map(url => new Connection(url, 'confirmed'));
  for (const connection of connections) {
    try {
      await connection.getVersion();
    } catch {
      continue;
    }
  }
  return connections;
}

async function fundPayer(payer: Keypair, connections: Connection[]): Promise<Connection> {
  let lastError = 'No faucet attempt made';
  for (let round = 1; round <= 4; round += 1) {
    for (const connection of connections) {
      try {
        const signature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(signature, 'confirmed');
        const balance = await connection.getBalance(payer.publicKey, 'confirmed');
        if (balance >= 0.5 * LAMPORTS_PER_SOL) return connection;
      } catch (error) {
        lastError = String(error);
        log('warn', 'Devnet airdrop attempt failed', { round, error: lastError });
      }
    }
    await delay(round * 2000);
  }
  throw new Error(`Unable to fund throwaway payer after retries: ${lastError}`);
}

async function main(): Promise<void> {
  const payer = Keypair.generate();
  const connections = await rpcConnections();
  if (connections.length === 0) throw new Error('No Devnet RPC endpoint passed health checks');
  const fundingConnection = await fundPayer(payer, connections);
  console.log(`Throwaway payer: ${payer.publicKey.toBase58()}`);
  const mint = await createMint(fundingConnection, payer, payer.publicKey, null, 6);
  const payerAta = await getOrCreateAssociatedTokenAccount(fundingConnection, payer, mint, payer.publicKey);
  await mintTo(fundingConnection, payer, mint, payerAta.address, payer, 1_000_000_000n);
  console.log(`Throwaway mint: ${mint.toBase58()}`);

  process.env.PAYER_SECRET_KEY = bs58.encode(payer.secretKey);
  process.env.RECIPIENT = recipient;
  process.env.MINT = mint.toBase58();
  process.env.AMOUNT = '0.1';
  process.env.SCHEDULE = '*/30 * * * * *';
  process.env.PAUSE_API_PORT = '18787';
  process.env.PAUSE_API_KEY = apiKey;
  process.env.MAX_RETRIES = '3';
  process.env.MIN_INTERVAL_SECONDS = '1';
  process.env.AUDIT_LOG_PATH = auditPath;
  await rm(auditPath, { force: true });

  const service = new OrchestratorService(loadConfig());
  await service.initialize();
  await service.startControlPlane();
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const pause = await fetch('http://127.0.0.1:18787/pause', { method: 'POST', headers });
  console.log(`POST /pause -> ${pause.status} ${JSON.stringify(await pause.json())}`);
  const resume = await fetch('http://127.0.0.1:18787/resume', { method: 'POST', headers });
  console.log(`POST /resume -> ${resume.status} ${JSON.stringify(await resume.json())}`);
  const health = await fetch('http://127.0.0.1:18787/healthz');
  console.log(`GET /healthz -> ${health.status} ${JSON.stringify(await health.json())}`);

  const result = await service.runScheduled();
  if (!result || result.status !== 'confirmed' || !result.signature) {
    throw new Error(`Demo payout did not confirm: ${JSON.stringify(result)}`);
  }
  console.log(`Confirmed signature: ${result.signature}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
  console.log(`Audit: ${JSON.stringify(result.audit)}`);
  await service.shutdown();
}

try {
  execFileSync('node', ['--version'], { stdio: 'ignore' });
  await main();
} catch (error) {
  log('error', 'Demo failed', { error: String(error) });
  process.exitCode = 1;
}
