import { useState, useCallback } from 'react';
import { computeP1 } from '../lib/computeP1';
import { fmtUSD, fmtPct, fmtVol } from '../lib/formatters';
import { DEXSCREENER_PAIR, BIRDEYE_URL, SOLSCAN_URL, RUGCHECK_URL, GMGN_URL } from '../lib/constants';
import type { Pair, P1Result, RiskLevel } from '../types';

/* ── Clipboard helper with execCommand fallback ── */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch { return false; }
  }
}

function P1Badge({ score }: { score: number }) {
  const cls = score >= 75 ? 'badge-high' : score >= 50 ? 'badge-mid' : 'badge-low';
  return <span className={`badge ${cls}`}>{score} P1</span>;
}
function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, string> = {
    low: 'badge-mid', medium: 'badge-low', high: 'badge-danger', unknown: 'badge-admin',
  };
  return <span className={`badge ${map[risk]}`}>{risk.toUpperCase()} RISK</span>;
}

function ScoreBar({ label, score, green }: { label: string; score: number; green?: boolean }) {
  return (
    <div className="p1-bar-row">
      <span className="muted text-xs bar-label">{label}</span>
      <div className="bar-track">
        <div className={`neon-bar${green ? ' neon-bar-green' : ''}`}
             style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="text-xs muted bar-value">{score}</span>
    </div>
  );
}

function DarkPoolMeter({ score }: { score: number }) {
  if (score < 30) return null;
  const cls = score >= 75 ? 'dp-high' : score >= 50 ? 'dp-mid' : 'dp-low';
  return (
    <div className={`signal-bar dp-bar ${cls}`}>
      <span className="signal-icon">🌑</span>
      <span className="signal-label">DARK POOL</span>
      <div className="signal-track">
        <div className="signal-fill dp-fill" style={{ width: `${score}%` }} />
      </div>
      <span className="signal-score">{score}</span>
    </div>
  );
}

function CatalystMeter({ score }: { score: number }) {
  if (score < 30) return null;
  const cls = score >= 75 ? 'cat-high' : score >= 50 ? 'cat-mid' : 'cat-low';
  return (
    <div className={`signal-bar cat-bar ${cls}`}>
      <span className="signal-icon">⚡</span>
      <span className="signal-label">CATALYST</span>
      <div className="signal-track">
        <div className="signal-fill cat-fill" style={{ width: `${score}%` }} />
      </div>
      <span className="signal-score">{score}</span>
    </div>
  );
}

function AccumBadge({ phase }: { phase: P1Result['accumPhase'] }) {
  if (phase === 'none') return null;
  const map = {
    'early-accum':  { label: 'EARLY ACCUM', cls: 'badge-accum-early' },
    'active-accum': { label: 'ACTIVE ACCUM', cls: 'badge-accum-active' },
    'breakout':     { label: 'BREAKOUT',     cls: 'badge-accum-break' },
  };
  const { label, cls } = map[phase];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'err'>('idle');

  const handleCopy = useCallback(async () => {
    if (state !== 'idle') return;
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'err');
    setTimeout(() => setState('idle'), 2000);
  }, [text, state]);

  return (
    <button
      onClick={handleCopy}
      className={`copy-btn${state === 'copied' ? ' copy-btn-ok' : state === 'err' ? ' copy-btn-err' : ''}`}
      title="Copy token address"
    >
      {state === 'copied' ? '✓ Copied' : state === 'err' ? '✗ Failed' : '⎘ Copy Address'}
    </button>
  );
}

/* Determine the card's neon glow class based on imminent score */
function glowClass(imminentScore: number): string {
  if (imminentScore >= 88) return 'card-neon-extreme';
  if (imminentScore >= 75) return 'card-neon-high';
  if (imminentScore >= 60) return 'card-neon-mid';
  return '';
}

interface Props {
  pair: Pair;
  rank: number;
}

export function TokenCard({ pair, rank }: Props) {
  const p1    = computeP1(pair);
  const pc5n  = pair.priceChange?.m5  ?? NaN;
  const pc1hn = pair.priceChange?.h1  ?? NaN;
  const pc24n = pair.priceChange?.h24 ?? NaN;
  const addr  = pair.baseToken?.address ?? '';
  const [expanded, setExpanded] = useState(false);

  const glow    = glowClass(p1.imminentScore);
  const isSurge = p1.imminentScore >= 60;

  return (
    <div className={`card p-4 ${glow}`}>

      {/* ── Rank + Symbol + Name ── */}
      <div className="row-between mb-2">
        <div className="row gap-2" style={{ minWidth: 0 }}>
          <span className="muted text-xs shrink0">#{rank}</span>
          <span className={`font-bold text-base shrink0 ${isSurge ? 'cyan' : ''}`}>
            {pair.baseToken?.symbol ?? '?'}
          </span>
          {p1.isNew && <span className="badge badge-new shrink0">NEW</span>}
          <span className="muted text-xs truncate">{pair.baseToken?.name}</span>
        </div>
        <div className="row gap-1">
          <span className="badge badge-imminent" title="Imminent Surge Score (P1 + Catalyst + Dark Pool)">
            {p1.imminentScore}▲
          </span>
          <P1Badge score={p1.score} />
          {p1.momentum > 70 && <span className="badge badge-momentum">MOM</span>}
          <AccumBadge phase={p1.accumPhase} />
        </div>
      </div>

      {/* ── Price + changes ── */}
      <div className="row-between mb-2" style={{ flexWrap: 'wrap', gap: '.3rem' }}>
        <span className={`text-lg font-bold mono-value${isSurge ? ' cyan' : ''}`}>
          {fmtUSD(pair.priceUsd)}
        </span>
        <div className="row gap-2 text-xs">
          <span className={!isNaN(pc5n)  && pc5n  >= 0 ? 'green' : 'red'}>{fmtPct(pc5n)}  5m</span>
          <span className={!isNaN(pc1hn) && pc1hn >= 0 ? 'green' : 'red'}>{fmtPct(pc1hn)} 1h</span>
          <span className={!isNaN(pc24n) && pc24n >= 0 ? 'green' : 'red'}>{fmtPct(pc24n)} 24h</span>
        </div>
      </div>

      {/* ── Dark Pool + Catalyst meters ── */}
      {(p1.darkPool >= 30 || p1.catalyst >= 30) && (
        <div className="signal-meters mb-2">
          <DarkPoolMeter score={p1.darkPool} />
          <CatalystMeter score={p1.catalyst} />
        </div>
      )}

      {/* ── Catalyst / dark-pool flags ── */}
      {(p1.catalystFlags.length > 0 || p1.darkPoolFlags.length > 0) && (
        <div className="flags mb-2">
          {p1.catalystFlags.map(f => <span key={f} className="flag-tag flag-cat text-xs">{f}</span>)}
          {p1.darkPoolFlags.map(f => <span key={f} className="flag-tag flag-dp text-xs">{f}</span>)}
        </div>
      )}

      {/* ── P1 component bars ── */}
      <div className="p1-bars">
        {Object.entries(p1.components).map(([k, c]) => (
          <ScoreBar key={k} label={c.label} score={c.score} green={k === 'momentum'} />
        ))}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid-2 text-xs mb-2">
        <div><div className="muted mb-1">Vol 5m</div><div className="mono-value">{fmtVol(pair.volume?.m5)}</div></div>
        <div><div className="muted mb-1">Vol 24h</div><div className="mono-value">{fmtVol(pair.volume?.h24)}</div></div>
        <div><div className="muted mb-1">Liquidity</div><div className="mono-value">{fmtVol(pair.liquidity?.usd)}</div></div>
        <div><div className="muted mb-1">Mkt Cap</div><div className="mono-value">{fmtVol(pair.marketCap)}</div></div>
      </div>

      {/* ── Expanded admin detail ── */}
      {expanded && (
        <div className="mb-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
          <table className="diag-table"><tbody>
            <tr><td>Imminent Score</td><td className="cyan font-bold">{p1.imminentScore}/100</td></tr>
            <tr><td>Dark Pool</td><td className="purple">{p1.darkPool}/100</td></tr>
            <tr><td>Catalyst</td><td className="orange">{p1.catalyst}/100</td></tr>
            <tr><td>Buy Ratio (5m)</td><td className={p1.buyRatio >= 2 ? 'green' : p1.buyRatio < 1 ? 'red' : ''}>{p1.buyRatio}×</td></tr>
            <tr><td>Confidence</td><td className="cyan">{p1.confidence}%</td></tr>
            <tr><td>Momentum</td><td className="orange">{p1.momentum}/100</td></tr>
            <tr><td>Risk Level</td><td><RiskBadge risk={p1.risk} /></td></tr>
            <tr><td>DEX</td><td className="muted">{pair.dexId}</td></tr>
            <tr><td>FDV</td><td className="mono-value">{fmtVol(pair.fdv)}</td></tr>
            <tr><td>Address</td><td className="muted" style={{ fontSize: '.58rem', wordBreak: 'break-all' }}>{addr}</td></tr>
          </tbody></table>
          {/* Copy address block */}
          {addr && (
            <div className="copy-row mt-2">
              <code className="addr-code">{addr.slice(0, 8)}…{addr.slice(-8)}</code>
              <CopyButton text={addr} />
            </div>
          )}
        </div>
      )}

      {/* ── P1 signal flags ── */}
      {p1.flags.length > 0 && (
        <div className="flags mb-2">
          {p1.flags.map(f => <span key={f} className="flag-tag text-xs">{f}</span>)}
        </div>
      )}

      {/* ── Links + copy + expand ── */}
      <div className="row-between">
        <div className="row gap-2 text-xs">
          <a href={DEXSCREENER_PAIR(pair.pairAddress)} target="_blank" rel="noreferrer" className="cyan">DEX ↗</a>
          <a href={BIRDEYE_URL(addr)}                  target="_blank" rel="noreferrer" className="purple">Bird ↗</a>
          <a href={SOLSCAN_URL(addr)}                  target="_blank" rel="noreferrer" className="green">Scan ↗</a>
          <a href={RUGCHECK_URL(addr)}                 target="_blank" rel="noreferrer" className="amber">Rug ↗</a>
          <a href={GMGN_URL(addr)}                     target="_blank" rel="noreferrer" className="orange">GMGN ↗</a>
        </div>
        <div className="row gap-1">
          {!expanded && addr && (
            <CopyButton text={addr} />
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="btn btn-cyan"
            style={{ padding: '.1rem .5rem', fontSize: '.6rem' }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
    </div>
  );
}
