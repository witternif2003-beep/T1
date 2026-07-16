# T1 Devnet Payout Orchestrator

This is a standalone Node/TypeScript backend for scheduled Devnet SPL payouts. It is intentionally separate from the Vite static sites and is not included in the GitHub Pages workflow.

The service uses an in-process cron scheduler, a small Express control plane, multi-RPC failover, and an append-only hash-chained JSONL audit log. It deliberately does not use Redis, BullMQ, Postgres, KMS, or Prometheus.

## Setup

```bash
cd payout-orchestrator
cp .env.example .env
# Fill in PAYER_SECRET_KEY and PAUSE_API_KEY. Never commit .env.
npm ci
npm run build
npm start
```

`PAYER_SECRET_KEY` accepts either a base58 secret key or a JSON byte array. The payer key is loaded only by this backend process; never commit it or print it.

## Control plane

The control plane binds to `127.0.0.1` by default.

```bash
curl -i http://127.0.0.1:8787/healthz
curl -s http://127.0.0.1:8787/status
curl -X POST -H "Authorization: Bearer $PAUSE_API_KEY" http://127.0.0.1:8787/pause
curl -X POST -H "Authorization: Bearer $PAUSE_API_KEY" http://127.0.0.1:8787/resume
```

`/healthz` returns HTTP 200 only when at least one configured RPC responds to both version and slot checks and there is no fatal startup state. `/pause` opens the in-memory circuit breaker; `/resume` closes it.

## Demo

The demo generates a throwaway payer, retries Devnet SOL faucet requests across configured RPCs, creates a new six-decimal mint, mints test tokens to the payer, starts the control plane, exercises pause/resume/health, and runs one real payout to the fixed recipient.

```bash
npm run demo
```

The demo writes `demo-audit.log` (gitignored), prints the confirmed transaction signature and Devnet Explorer URL, then shuts down cleanly. The generated payer and mint are throwaway Devnet objects.

## Deployment artifacts

`ecosystem.config.js` and `t1-payout-orchestrator.service` are documentation-only examples for PM2/systemd. They are not run by the repository workflow.
