import { useState, useCallback } from 'react';
import { computeP1 } from '../lib/computeP1';
import { fmtUSD, fmtPct, fmtVol } from '../lib/formatters';
import { YAHOO_URL, FINVIZ_URL, STOCKANALYSIS, SHORTSQUEEZE, BARCHART_URL } from '../lib/constants';
import type { Stock, StockP1, RiskLevel } from '../types';

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
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

function ScoreBar({ label, score, alt }: { label: string; score: number; alt?: boolean }) {
  return (
    <div className="p1-bar-row">
      <span className="muted bar-label text-xs">{label}</span>
      <div className="bar-track">
        <div className={`neon-bar${alt ? ' neon-bar-alt' : ''}`}
             style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="bar-value text-xs muted">{score}</span>
    </div>
  );
}

function DPMeter({ score }: { score: number }) {
  if (score < 30) return null;
  const cls = score >= 70 ? 'dp-high' : score >= 50 ? 'dp-mid' : 'dp-low';
  return (
    <div className={`signal-bar dp-bar ${cls}`}>
      <span className="signal-icon">🌑</span>
      <span className="signal-label">DARK POOL</span>
      <div className="signal-track"><div className="signal-fill dp-fill" style={{ width: `${score}%` }} /></div>
      <span className="signal-score">{score}</span>
    </div>
  );
}

function CatMeter({ score }: { score: number }) {
  if (score < 30) return null;
  const cls = score >= 70 ? 'cat-high' : score >= 50 ? 'cat-mid' : 'cat-low';
  return (
    <div className={`signal-bar cat-bar ${cls}`}>
      <span className="signal-icon">⚡</span>
      <span className="signal-label">CATALYST</span>
      <div className="signal-track"><div className="signal-fill cat-fill" style={{ width: `${score}%` }} /></div>
      <span className="signal-score">{score}</span>
    </div>
  );
}

function AccumBadge({ phase }: { phase: StockP1['accumPhase'] }) {
  if (phase === 'none') return null;
  const map: Record<string, { label: string; cls: string }> = {
    'early-accum':  { label: 'EARLY ACCUM', cls: 'badge-accum-early'  },
    'active-accum': { label: 'ACTIVE ACCUM', cls: 'badge-accum-active' },
    'squeeze':      { label: 'SQUEEZE',      cls: 'badge-squeeze'      },
    'breakout':     { label: 'BREAKOUT',     cls: 'badge-accum-break'  },
  };
  const { label, cls } = map[phase] ?? { label: phase.toUpperCase(), cls: 'badge-mid' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, string> = {
    low: 'badge-risk-low', medium: 'badge-risk-mid', high: 'badge-danger', unknown: 'badge-admin',
  };
  return <span className={`badge ${map[risk]}`}>{risk.toUpperCase()} RISK</span>;
}

function CopyBtn({ text, label = '⎘' }: { text: string; label?: string }) {
  const [s, setS] = useState<'idle' | 'ok' | 'err'>('idle');
  const handle = useCallback(async () => {
    if (s !== 'idle') return;
    setS(await copyText(text) ? 'ok' : 'err');
    setTimeout(() => setS('idle'), 2000);
  }, [text, s]);
  return (
    <button
      onClick={handle}
      className={`copy-btn${s === 'ok' ? ' copy-btn-ok' : s === 'err' ? ' copy-btn-err' : ''}`}
      title="Copy ticker to clipboard"
    >
      {s === 'ok' ? '✓ Copied' : s === 'err' ? '✗ Failed' : label}
    </button>
  );
}

function glowClass(score: number): string {
  if (score >= 88) return 'card-neon-extreme';
  if (score >= 74) return 'card-neon-high';
  if (score >= 58) return 'card-neon-mid';
  return '';
}

export function StockCard({ stock, rank }: { stock: Stock; rank: number }) {
  const p1       = computeP1(stock);
  const up       = stock.changePct >= 0;
  const [exp, setExp] = useState(false);
  const glow     = glowClass(p1.imminentScore);

  return (
    <div className={`card p-4 ${glow}`}>

      {/* ── Header row ── */}
      <div className="row-between mb-2">
        <div className="row gap-2" style={{ minWidth: 0 }}>
          <span className="muted text-xs shrink0">#{rank}</span>
          <span className={`font-bold text-base shrink0 ${p1.imminentScore >= 58 ? 'green' : ''}`}>
            {stock.symbol}
          </span>
          {p1.squeezeSetup && <span className="badge badge-squeeze shrink0">SQZ</span>}
          <span className="muted text-xs truncate">{stock.name}</span>
        </div>
        <div className="row gap-1">
          <span className="badge badge-imminent" title="Imminent Surge Score">{p1.imminentScore}▲</span>
          <span className={`badge ${p1.score >= 75 ? 'badge-high' : p1.score >= 50 ? 'badge-mid' : 'badge-low'}`}>
            {p1.score} P1
          </span>
          <AccumBadge phase={p1.accumPhase} />
        </div>
      </div>

      {/* ── Price row ── */}
      <div className="row-between mb-2" style={{ flexWrap: 'wrap', gap: '.3rem' }}>
        <span className={`text-xl font-bold mono-value ${up ? 'green' : 'red'}`}>
          {fmtUSD(stock.price)}
        </span>
        <div className="row gap-3 text-xs">
          <span className={up ? 'green' : 'red'}>{fmtPct(stock.changePct)}</span>
          <span className="muted">Vol {fmtVol(stock.volume)}</span>
          <span className={p1.volRatio >= 2 ? 'amber' : 'muted'}>{p1.volRatio.toFixed(1)}× avg</span>
        </div>
      </div>

      {/* ── Signal meters ── */}
      {(p1.darkPool >= 30 || p1.catalyst >= 30) && (
        <div className="signal-meters mb-2">
          <DPMeter score={p1.darkPool} />
          <CatMeter score={p1.catalyst} />
        </div>
      )}

      {/* ── Signal flags ── */}
      {(p1.catalystFlags.length > 0 || p1.darkPoolFlags.length > 0) && (
        <div className="flags mb-2">
          {p1.catalystFlags.map(f => <span key={f} className="flag-tag flag-cat text-xs">{f}</span>)}
          {p1.darkPoolFlags.map(f => <span key={f} className="flag-tag flag-dp text-xs">{f}</span>)}
        </div>
      )}

      {/* ── P1 component bars ── */}
      <div className="p1-bars">
        {Object.entries(p1.components).map(([k, c]) => (
          <ScoreBar key={k} label={c.label} score={c.score} alt={k === 'momentum'} />
        ))}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid-2 text-xs mb-2">
        <div><div className="muted mb-1">Avg Vol 10d</div><div className="mono-value">{fmtVol(stock.avgVolume10d)}</div></div>
        <div><div className="muted mb-1">Mkt Cap</div><div className="mono-value">{fmtVol(stock.marketCap)}</div></div>
        <div><div className="muted mb-1">Float</div><div className="mono-value">{fmtVol(stock.floatShares)}</div></div>
        <div>
          <div className="muted mb-1">Short Float</div>
          <div className={`mono-value ${stock.shortFloat > 0.20 ? 'red' : 'amber'}`}>
            {stock.shortFloat > 0 ? `${(stock.shortFloat * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* ── Expanded admin detail ── */}
      {exp && (
        <div className="mb-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
          <table className="diag-table"><tbody>
            <tr><td>Imminent Score</td><td className="green font-bold">{p1.imminentScore}/100</td></tr>
            <tr><td>Dark Pool</td><td className="purple">{p1.darkPool}/100</td></tr>
            <tr><td>Catalyst</td><td className="amber">{p1.catalyst}/100</td></tr>
            <tr><td>Vol Ratio</td><td className={p1.volRatio >= 3 ? 'amber' : ''}>{p1.volRatio}× 10d avg</td></tr>
            <tr><td>Short Ratio</td><td>{stock.shortRatio > 0 ? `${stock.shortRatio.toFixed(1)}d` : '—'}</td></tr>
            <tr><td>Day Range</td><td className="mono-value">{fmtUSD(stock.dayLow, 4)} – {fmtUSD(stock.dayHigh, 4)}</td></tr>
            <tr><td>52w Range</td><td className="mono-value">{fmtUSD(stock.low52w, 4)} – {fmtUSD(stock.high52w, 4)}</td></tr>
            <tr><td>50d MA</td><td className={stock.price > stock.ma50 && stock.ma50 > 0 ? 'green' : 'muted'}>{fmtUSD(stock.ma50, 4)}</td></tr>
            <tr><td>200d MA</td><td className={stock.price > stock.ma200 && stock.ma200 > 0 ? 'green' : 'muted'}>{fmtUSD(stock.ma200, 4)}</td></tr>
            <tr><td>Exchange</td><td className="muted">{stock.exchange}</td></tr>
            <tr><td>Risk Level</td><td><RiskBadge risk={p1.risk} /></td></tr>
            <tr><td>Confidence</td><td className="green">{p1.confidence}%</td></tr>
          </tbody></table>
          <div className="copy-row mt-2">
            <code className="addr-code">{stock.symbol} — {stock.name}</code>
            <CopyBtn text={stock.symbol} label="⎘ Copy Ticker" />
          </div>
        </div>
      )}

      {/* ── P1 flags ── */}
      {p1.flags.length > 0 && (
        <div className="flags mb-2">
          {p1.flags.map(f => <span key={f} className="flag-tag text-xs">{f}</span>)}
        </div>
      )}

      {/* ── Links + controls ── */}
      <div className="row-between">
        <div className="row gap-2 text-xs">
          <a href={YAHOO_URL(stock.symbol)}     target="_blank" rel="noreferrer" className="green">Yahoo ↗</a>
          <a href={FINVIZ_URL(stock.symbol)}    target="_blank" rel="noreferrer" className="cyan">Finviz ↗</a>
          <a href={STOCKANALYSIS(stock.symbol)} target="_blank" rel="noreferrer" className="purple">SA ↗</a>
          <a href={SHORTSQUEEZE(stock.symbol)}  target="_blank" rel="noreferrer" className="red">SqzInfo ↗</a>
          <a href={BARCHART_URL(stock.symbol)}  target="_blank" rel="noreferrer" className="amber">Chart ↗</a>
        </div>
        <div className="row gap-1">
          {!exp && <CopyBtn text={stock.symbol} label="⎘" />}
          <button
            onClick={() => setExp(v => !v)}
            className="btn btn-green"
            style={{ padding: '.1rem .5rem', fontSize: '.6rem' }}
          >
            {exp ? '▲' : '▼'}
          </button>
        </div>
      </div>
    </div>
  );
}
