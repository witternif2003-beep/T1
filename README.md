# T1 — Solana / stock surge scanners + payout console

Vite + React monorepo. Use the Cursor-friendly `./cli` instead of home-directory copies, systemd, or a Python `venv`/`app.py` flow.

## Run in Cursor

```bash
./cli install
./cli start scanner          # http://127.0.0.1:5173/T1/
./cli start stock            # http://127.0.0.1:5174/T1/stock/
./cli start payout           # http://127.0.0.1:5175/T1/solana-payout-drop-console/
./cli status
./cli stop all
```

`start.sh` / `stop.sh` / `restart.sh` are thin wrappers around `./cli`.

| App | Directory | Dev URL |
|-----|-----------|---------|
| Solana Surge Scanner | `/` (repo root) | `http://127.0.0.1:5173/T1/` |
| NYSE Penny Surge Detector | `stock/` | `http://127.0.0.1:5174/T1/stock/` |
| Payout Drop Console | `solana-payout-drop-console/` | `http://127.0.0.1:5175/T1/solana-payout-drop-console/` |
| Payout orchestrator (backend) | `payout-orchestrator/` | see that folder’s README |

## Payout console notes

Devnet SPL transfers to fixed recipient `HrcLRCSvzTeGt5QYAuUzNXdX3ss1zSmnV4NRdB9Zu4VG`. You still need a connected Devnet wallet, the SPL mint, source token balance, and a wallet signature for live sends.

`t1-payout-app-root.service` files are documentation-only systemd examples and are not used by `./cli`.
