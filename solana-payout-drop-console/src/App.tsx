import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clusterApiUrl,
  Connection,
  ParsedTransactionWithMeta,
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

const RECIPIENT = 'HrcLRCSvzTeGt5QYAuUzNXdX3ss1zSmnV4NRdB9Zu4VG';
const COMMITMENT = 'confirmed' as const;
const connection = new Connection(clusterApiUrl('devnet'), COMMITMENT);
const explorer = (path: string) => `https://explorer.solana.com/${path}?cluster=devnet`;
const MAX_TOKEN_AMOUNT = (1n << 64n) - 1n;
const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

type RecipientValidation = {
  valid: boolean;
  onCurve: boolean;
  error?: string;
};

function validateRecipient(): RecipientValidation {
  try {
    const key = new PublicKey(RECIPIENT);
    const bytes = key.toBytes();
    const onCurve = PublicKey.isOnCurve(bytes);
    if (bytes.length !== 32) {
      return { valid: false, onCurve, error: 'Recipient address is not a 32-byte Solana public key.' };
    }
    if (!onCurve) {
      return { valid: false, onCurve, error: 'Recipient address is a PDA, not a wallet-owned account.' };
    }
    return { valid: true, onCurve };
  } catch {
    return { valid: false, onCurve: false, error: 'Recipient address is not a valid Solana public key.' };
  }
}

const recipientValidation = validateRecipient();
const recipientKey = recipientValidation.valid ? new PublicKey(RECIPIENT) : null;

type ActivitySignature = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
};

type BalanceDelta = {
  mint: string;
  amount: string;
  decimals: number;
};

function shortKey(value: string, start = 8, end = 6): string {
  return value.length > start + end ? `${value.slice(0, start)}…${value.slice(-end)}` : value;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('declined')) {
    return 'The wallet request was rejected.';
  }
  if (lower.includes('insufficient funds') || lower.includes('insufficient lamports')) {
    return 'The wallet does not have enough SOL for fees or this transaction.';
  }
  if (lower.includes('insufficient token')) {
    return 'The connected wallet does not have enough of this token.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Could not reach Solana Devnet. Check your connection and try again.';
  }
  return message.replace(/^Error:\s*/i, '') || 'Something went wrong. Please try again.';
}

function toRawAmount(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error('Enter a valid positive token amount.');
  }
  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > decimals && fraction.slice(decimals).replace(/0/g, '').length > 0) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }
  const units = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  const raw = BigInt(units || '0');
  if (raw <= 0n) throw new Error('Enter an amount greater than zero.');
  if (raw > MAX_TOKEN_AMOUNT) throw new Error('Amount is too large for an SPL token transfer.');
  return raw;
}

function formatTokenAmount(raw: string, decimals: number): string {
  const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  if (decimals === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function extractDeltas(transaction: ParsedTransactionWithMeta): BalanceDelta[] {
  const before = new Map<string, { amount: bigint; decimals: number }>();
  const after = new Map<string, { amount: bigint; decimals: number }>();
  for (const balance of transaction.meta?.preTokenBalances ?? []) {
    before.set(`${balance.accountIndex}:${balance.mint}`, {
      amount: BigInt(balance.uiTokenAmount.amount),
      decimals: balance.uiTokenAmount.decimals,
    });
  }
  for (const balance of transaction.meta?.postTokenBalances ?? []) {
    after.set(`${balance.accountIndex}:${balance.mint}`, {
      amount: BigInt(balance.uiTokenAmount.amount),
      decimals: balance.uiTokenAmount.decimals,
    });
  }
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].flatMap(key => {
    const oldValue = before.get(key) ?? { amount: 0n, decimals: after.get(key)?.decimals ?? 0 };
    const newValue = after.get(key) ?? { amount: 0n, decimals: oldValue.decimals };
    const delta = newValue.amount - oldValue.amount;
    if (delta === 0n) return [];
    return [{ mint: key.split(':')[1], amount: formatTokenAmount(delta.toString(), newValue.decimals), decimals: newValue.decimals }];
  });
}

export default function App() {
  const [wallet, setWallet] = useState<PublicKey | null>(window.solana?.publicKey ?? null);
  const [walletAvailable, setWalletAvailable] = useState(Boolean(window.solana));
  const [mintInput, setMintInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [mintDecimals, setMintDecimals] = useState<number | null>(null);
  const [loadingMint, setLoadingMint] = useState(false);
  const [payoutState, setPayoutState] = useState<'idle' | 'working'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<ActivitySignature[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyState, setVerifyState] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verification, setVerification] = useState<{
    slot: number;
    fee: string;
    deltas: BalanceDelta[];
    logs: string[];
  } | null>(null);

  const refreshActivity = useCallback(async () => {
    setActivityLoading(true);
    if (!recipientKey) {
      setActivity([]);
      setError(recipientValidation.error ?? 'Recipient validation failed.');
      setActivityLoading(false);
      return;
    }
    try {
      const signatures = await connection.getSignaturesForAddress(recipientKey, { limit: 8 }, COMMITMENT);
      setActivity(signatures.map(item => ({
        signature: item.signature,
        slot: item.slot,
        blockTime: item.blockTime ?? null,
        err: item.err,
      })));
    } catch (err) {
      setError(`Recipient activity unavailable: ${friendlyError(err)}`);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const detect = () => {
      if (active) {
        setWalletAvailable(Boolean(window.solana));
        setWallet(window.solana?.publicKey ?? null);
      }
    };
    detect();
    const timer = window.setInterval(detect, 1000);
    void refreshActivity();
    const activityTimer = window.setInterval(() => void refreshActivity(), 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(activityTimer);
    };
  }, [refreshActivity]);

  const connectWallet = async () => {
    setError('');
    if (!window.solana) {
      setError('No compatible wallet found. Install Phantom or another Solana browser wallet.');
      return;
    }
    try {
      const result = await window.solana.connect();
      setWallet(result.publicKey);
      setMessage('Wallet connected.');
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const disconnectWallet = async () => {
    try {
      await window.solana?.disconnect();
      setWallet(null);
      setMessage('Wallet disconnected.');
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const validateMint = async (value: string): Promise<{ key: PublicKey; decimals: number }> => {
    let key: PublicKey;
    try {
      key = new PublicKey(value.trim());
    } catch {
      throw new Error('Enter a valid Solana mint address.');
    }
    const mint = await getMint(connection, key, COMMITMENT);
    return { key, decimals: mint.decimals };
  };

  const inspectMint = async () => {
    setError('');
    setMessage('');
    setMintDecimals(null);
    if (!mintInput.trim()) return;
    setLoadingMint(true);
    try {
      const result = await validateMint(mintInput);
      setMintDecimals(result.decimals);
      setMessage(`Mint verified. Token precision: ${result.decimals} decimals.`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoadingMint(false);
    }
  };

  const sendPayout = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!recipientValidation.valid || !recipientKey) {
      setError(recipientValidation.error ?? 'Recipient validation failed. Payouts are disabled.');
      return;
    }
    if (!wallet || !window.solana) {
      setError('Connect a browser wallet before sending a payout.');
      return;
    }
    setPayoutState('working');
    try {
      const { key: mint, decimals } = await validateMint(mintInput);
      const rawAmount = toRawAmount(amountInput, decimals);
      setMintDecimals(decimals);
      const senderAta = await getAssociatedTokenAddress(mint, wallet);
      const recipientAta = await getAssociatedTokenAddress(mint, recipientKey);
      const transaction = new Transaction();
      const recipientAccount = await connection.getAccountInfo(recipientAta, COMMITMENT);
      if (!recipientAccount) {
        transaction.add(createAssociatedTokenAccountInstruction(
          wallet,
          recipientAta,
          recipientKey,
          mint,
          TOKEN_PROGRAM_ID,
        ));
      }
      transaction.add(createTransferCheckedInstruction(
        senderAta,
        mint,
        recipientAta,
        wallet,
        rawAmount,
        decimals,
        [],
        TOKEN_PROGRAM_ID,
      ));
      const latestBlockhash = await connection.getLatestBlockhash(COMMITMENT);
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = wallet;
      let signature: string;
      if (window.solana.signAndSendTransaction) {
        const result = await window.solana.signAndSendTransaction(transaction);
        signature = typeof result === 'string' ? result : result.signature;
      } else if (window.solana.signTransaction) {
        const signed = await window.solana.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      } else {
        throw new Error('This wallet cannot sign transactions.');
      }
      await connection.confirmTransaction({ signature, ...latestBlockhash }, COMMITMENT);
      setMessage(`Payout confirmed: ${formatTokenAmount(rawAmount.toString(), decimals)} tokens.`);
      setVerifyInput(signature);
      await refreshActivity();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPayoutState('idle');
    }
  };

  const verifyTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerifyError('');
    setVerifyState('Loading transaction…');
    setVerification(null);
    try {
      const signature = verifyInput.trim();
      if (!signature) throw new Error('Enter a transaction signature.');
      if (!SOLANA_SIGNATURE_PATTERN.test(signature)) {
        throw new Error('Enter a valid Solana transaction signature.');
      }
      const transaction = await connection.getParsedTransaction(signature, {
        commitment: COMMITMENT,
        maxSupportedTransactionVersion: 0,
      });
      if (!transaction) throw new Error('Transaction was not found on Devnet.');
      setVerification({
        slot: transaction.slot,
        fee: `${(transaction.meta?.fee ?? 0) / 1_000_000_000} SOL`,
        deltas: extractDeltas(transaction),
        logs: transaction.meta?.logMessages ?? [],
      });
      setVerifyState('Transaction loaded.');
    } catch (err) {
      setVerifyError(friendlyError(err));
      setVerifyState('');
    }
  };

  const walletLabel = useMemo(() => wallet ? shortKey(wallet.toBase58()) : 'Not connected', [wallet]);

  return (
    <main className="shell">
      <header className="hero card">
        <div>
          <p className="eyebrow">DEVNET · PAYOUT OPERATIONS</p>
          <h1>Solana Payout Drop Console</h1>
          <p className="subtitle">Browser-signed SPL token transfers with an auditable Devnet trail.</p>
        </div>
        <div className="recipient">
          <span className="label">Fixed recipient</span>
          <code>{shortKey(RECIPIENT, 12, 10)}</code>
          {recipientValidation.valid
            ? <span className="audit-badge">✓ Validated · 32-byte ed25519 · wallet account</span>
            : <span className="audit-badge audit-failed">✗ Recipient validation failed</span>}
          {!recipientValidation.valid && <span className="error">{recipientValidation.error}</span>}
          <a href={explorer(`address/${RECIPIENT}`)} target="_blank" rel="noreferrer">Open in Solana Explorer ↗</a>
        </div>
      </header>

      <section className="card wallet-panel">
        <div>
          <span className="label">Wallet connection</span>
          <strong className={wallet ? 'online' : 'offline'}>{wallet ? walletLabel : walletAvailable ? 'Wallet ready' : 'Wallet not detected'}</strong>
        </div>
        <div className="button-row">
          {wallet ? <button className="secondary" onClick={() => void disconnectWallet()}>Disconnect</button> : <button onClick={() => void connectWallet()}>Connect wallet</button>}
          {wallet && <a className="wallet-link" href={explorer(`address/${wallet.toBase58()}`)} target="_blank" rel="noreferrer">View wallet ↗</a>}
        </div>
      </section>

      <div className="grid two-up">
        <section className="card">
          <div className="section-heading"><div><p className="eyebrow">STAGE 01 → 03</p><h2>Prepare payout</h2></div><span className="stage">BROWSER SIGNED</span></div>
          <form className="stack" onSubmit={(event) => void sendPayout(event)}>
            <label>Token mint address<input value={mintInput} onChange={event => { setMintInput(event.target.value); setMintDecimals(null); }} placeholder="Paste an SPL mint address" spellCheck={false} /></label>
            <div className="inline">
              <label>Amount<input value={amountInput} onChange={event => setAmountInput(event.target.value)} inputMode="decimal" placeholder="0.00" /></label>
              <div className="precision"><span className="label">Precision</span><strong>{mintDecimals == null ? '—' : `${mintDecimals} decimals`}</strong></div>
            </div>
            <div className="button-row">
              <button type="button" className="secondary" onClick={() => void inspectMint()} disabled={loadingMint || !mintInput.trim()}>{loadingMint ? 'Checking…' : 'Check mint'}</button>
              <button type="submit" disabled={!wallet || !recipientValidation.valid || payoutState === 'working'}>{payoutState === 'working' ? 'Sending…' : 'Send payout'}</button>
            </div>
            <p className="hint">If needed, the recipient token account is created in the same transaction.</p>
          </form>
        </section>

        <section className="card">
          <div className="section-heading"><div><p className="eyebrow">STAGE 04</p><h2>Recipient activity</h2></div><button className="icon-button" onClick={() => void refreshActivity()} disabled={activityLoading}>↻</button></div>
          {activity.length === 0 ? <p className="muted">{activityLoading ? 'Loading Devnet signatures…' : 'No recent signatures found.'}</p> : <div className="activity-list">{activity.map(item => <a className="activity-item" key={item.signature} href={explorer(`tx/${item.signature}`)} target="_blank" rel="noreferrer"><span>{shortKey(item.signature, 14, 10)}</span><small>slot {item.slot} · {item.err ? 'failed' : 'success'}</small></a>)}</div>}
          <p className="hint">Automatically refreshed every 20 seconds.</p>
        </section>
      </div>

      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">AUDIT CONSOLE</p><h2>Verify transaction</h2></div><span className="stage">READ ONLY</span></div>
        <form className="verify-row" onSubmit={(event) => void verifyTransaction(event)}>
          <input value={verifyInput} onChange={event => setVerifyInput(event.target.value)} placeholder="Paste a Devnet transaction signature" spellCheck={false} />
          <button type="submit">Verify</button>
        </form>
        {verifyState && <p className="status">{verifyState}</p>}
        {verifyError && <p className="error">{verifyError}</p>}
        {verification && <div className="verification">
          <div className="stats"><div><span className="label">Slot</span><strong>{verification.slot}</strong></div><div><span className="label">Fee</span><strong>{verification.fee}</strong></div></div>
          <h3>Token balance deltas</h3>
          {verification.deltas.length === 0 ? <p className="muted">No token balance changes were reported.</p> : <div className="delta-list">{verification.deltas.map((delta, index) => <div className="delta" key={`${delta.mint}-${index}`}><code>{shortKey(delta.mint)}</code><strong className={delta.amount.startsWith('-') ? 'negative' : 'positive'}>{delta.amount}</strong></div>)}</div>}
          <h3>Program logs</h3>
          <pre>{verification.logs.length ? verification.logs.join('\n') : 'No log messages.'}</pre>
        </div>}
      </section>

      {(message || error) && <div className={error ? 'notice error' : 'notice'}>{error || message}</div>}
      <footer>Devnet only · No private keys leave your wallet · <a href={explorer('')} target="_blank" rel="noreferrer">Explorer</a></footer>
    </main>
  );
}
