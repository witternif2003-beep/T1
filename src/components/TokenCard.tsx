import { useState } from 'react';
import { computeP1 } from '../lib/computeP1';
import { fmtUSD, fmtPct, fmtVol } from '../lib/formatters';
import { DEXSCREENER_PAIR, BIRDEYE_URL, SOLSCAN_URL, RUGCHECK_URL, GMGN_URL } from '../lib/constants';
import type { Pair, P1Result, RiskLevel } from '../types';

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

function P1Bars({ components }: { components: P1Result['components'] }) {
  return (
    <div className="p1-bars">
      {Object.entries(components).map(([k, c]) => (
        <div key={k} className="p1-bar-row">
          <span className="muted text-xs bar-label">{c.label}</span>
          <div className="bar-track">
            <div
              className={`neon-bar${k === 'momentum' ? ' neon-bar-green' : ''}`}
              style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
            />
          </div>
          <span className="text-xs muted bar-value">{c.score}</span>
        </div>
      ))}
    </div>
  );
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

  return (
    <div
      className={`card p-4${p1.score >= 80 ? ' card-surge' : ''}`}
      style={{ borderColor: p1.score >= 75 ? 'rgba(0,240,255,.35)' : undefined }}
    >
      {/* Header */}
      <div className="row-between mb-2">
        <div className="row gap-2" style={{ minWidth: 0 }}>
          <span className="muted text-xs shrink0">#{rank}</span>
          <span className="font-bold text-base cyan shrink0">{pair.baseToken?.symbol ?? '?'}</span>
          <span className="muted text-xs truncate">{pair.baseToken?.name}</span>
        </div>
        <div className="row gap-1">
          <P1Badge score={p1.score} />
          {p1.momentum > 70 && <span className="badge badge-momentum">MOM</span>}
        </div>
      </div>

      {/* Price */}
      <div className="row-between mb-3 flex-wrap" style={{ gap: '.3rem' }}>
        <span className="text-lg font-bold mono-value">{fmtUSD(pair.priceUsd)}</span>
        <div className="row gap-2 text-xs">
          <span className={!isNaN(pc5n)  && pc5n  >= 0 ? 'green' : 'red'}>{fmtPct(pc5n)}  5m</span>
          <span className={!isNaN(pc1hn) && pc1hn >= 0 ? 'green' : 'red'}>{fmtPct(pc1hn)} 1h</span>
          <span className={!isNaN(pc24n) && pc24n >= 0 ? 'green' : 'red'}>{fmtPct(pc24n)} 24h</span>
        </div>
      </div>

      {/* P1 component bars */}
      <P1Bars components={p1.components} />

      {/* Stats grid */}
      <div className="grid-2 text-xs mb-3">
        <div><div className="muted mb-1">Vol 5m</div><div className="mono-value">{fmtVol(pair.volume?.m5)}</div></div>
        <div><div className="muted mb-1">Vol 24h</div><div className="mono-value">{fmtVol(pair.volume?.h24)}</div></div>
        <div><div className="muted mb-1">Liquidity</div><div className="mono-value">{fmtVol(pair.liquidity?.usd)}</div></div>
        <div><div className="muted mb-1">Mkt Cap</div><div className="mono-value">{fmtVol(pair.marketCap)}</div></div>
      </div>

      {/* Expanded admin detail */}
      {expanded && (
        <div className="mb-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
          <table className="diag-table"><tbody>
            <tr><td>Buy Ratio (5m)</td><td className={p1.buyRatio >= 2 ? 'green' : p1.buyRatio < 1 ? 'red' : ''}>{p1.buyRatio}x</td></tr>
            <tr><td>Confidence</td><td className="cyan">{p1.confidence}%</td></tr>
            <tr><td>Momentum</td><td className="orange">{p1.momentum}/100</td></tr>
            <tr><td>Risk Level</td><td><RiskBadge risk={p1.risk} /></td></tr>
            <tr><td>DEX</td><td className="muted">{pair.dexId}</td></tr>
            <tr><td>FDV</td><td className="mono-value">{fmtVol(pair.fdv)}</td></tr>
            <tr><td>Address</td><td className="muted truncate" style={{ maxWidth: 110, fontSize: '.58rem' }}>{addr}</td></tr>
          </tbody></table>
        </div>
      )}

      {/* Signal flags */}
      {p1.flags.length > 0 && (
        <div className="flags mb-3">
          {p1.flags.map(f => <span key={f} className="flag-tag text-xs">{f}</span>)}
        </div>
      )}

      {/* Links + expand toggle */}
      <div className="row-between">
        <div className="row gap-2 text-xs">
          <a href={DEXSCREENER_PAIR(pair.pairAddress)} target="_blank" rel="noreferrer" className="cyan">DEX ↗</a>
          <a href={BIRDEYE_URL(addr)}                  target="_blank" rel="noreferrer" className="purple">Bird ↗</a>
          <a href={SOLSCAN_URL(addr)}                  target="_blank" rel="noreferrer" className="green">Scan ↗</a>
          <a href={RUGCHECK_URL(addr)}                 target="_blank" rel="noreferrer" className="amber">Rug ↗</a>
          <a href={GMGN_URL(addr)}                     target="_blank" rel="noreferrer" className="orange">GMGN ↗</a>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="btn btn-cyan"
          style={{ padding: '.1rem .5rem', fontSize: '.6rem' }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
