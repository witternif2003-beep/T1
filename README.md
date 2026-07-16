# Solana Payout Drop Console

This folder contains a standalone, self-contained web app for verifiable Solana Devnet SPL-token payouts to a fixed recipient wallet:

- Fixed recipient wallet: `HrcLRCSvzTeGt5QYAuUzNXdX3ss1zSmnV4NRdB9Zu4VG`
- Browser-wallet approval flow
- Associated Token Account preview for the recipient
- Checked SPL token transfer flow
- Transaction verification panel

## Files

- `index.html` — standalone single-file web app
- `start.sh` — local static server start helper on port `8091`
- `stop.sh` — stop helper
- `restart.sh` — restart helper
- `t1-payout-app-root.service` — example `systemd --user` unit

## Local usage

```bash
cd solana-payout-drop-console
python3 -m http.server 8091
```

Then open:

- `http://localhost:8091/`

## systemd --user install

```bash
mkdir -p ~/.config/systemd/user
cp t1-payout-app-root.service ~/.config/systemd/user/t1-payout-app-root.service
systemctl --user daemon-reload
systemctl --user enable t1-payout-app-root.service
systemctl --user start t1-payout-app-root.service
```

## Runtime notes

The app is designed for Devnet-first testing. To send a live test payout, you still need:

- a connected Devnet wallet
- the exact custom SPL mint address
- a source token account with enough balance
- wallet signature approval at runtime
