import { useEffect, useRef, useState } from 'react';
import { SESSION } from '../lib/session';
import { VERSION, ENDPOINTS, PROXIES, MAX_PRICE_USD, SURGE_THRESHOLD } from '../lib/constants';
import { RateLimit } from '../lib/rateLimit';
import { fmtTime, fmtDuration } from '../lib/formatters';
import { WebGLSupport } from './Telemetry3D';
import { marketStatusMsg } from '../lib/network';
import type { FetchStats, LogEntry, Stock } from '../types';

interface Props {
  stats:     FetchStats;
  logs:      LogEntry[];
  stocks:    Stock[];
  onClear:   () => void;
  onRefresh: () => void;
}

export function AdminPanel({ stats, logs, stocks, onClear, onRefresh }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0; }, [logs]);
  useEffect(() => { const id = setInterval(() => tick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  return (
    <div className="admin-panel p-4 mb-4">
      <div className="grid-2 gap-4 mb-3">

        {/* System */}
        <div>
          <div className="text-xs amber mb-2" style={{ letterSpacing: '.1em' }}>◈ SYSTEM</div>
          <table className="diag-table"><tbody>
            <tr><td>Session ID</td><td className="green">{SESSION.id}</td></tr>
            <tr><td>JWT Token</td><td className="muted" style={{ fontSize: '.55rem' }}>{SESSION.token.slice(0, 28)}…</td></tr>
            <tr><td>App Version</td><td>{VERSION.app}</td></tr>
            <tr><td>P1 Engine</td><td className="green">{VERSION.p1}</td></tr>
            <tr><td>Price Cap</td><td className="green">≤ ${MAX_PRICE_USD.toFixed(2)}</td></tr>
            <tr><td>Surge Threshold</td><td className="amber">≥ {SURGE_THRESHOLD}</td></tr>
            <tr><td>WebGL</td><td className={WebGLSupport.ok ? 'green' : 'red'}>{WebGLSupport.version}</td></tr>
            <tr><td>Market Status</td><td className="amber">{marketStatusMsg()}</td></tr>
            <tr><td>Uptime</td><td>{fmtDuration(SESSION.uptime * 1000)}</td></tr>
          </tbody></table>
        </div>

        {/* Network */}
        <div>
          <div className="text-xs amber mb-2" style={{ letterSpacing: '.1em' }}>◈ NETWORK</div>
          <table className="diag-table"><tbody>
            <tr><td>Data Sources</td><td className="green" style={{ fontSize: '.62rem' }}>{stats.source || '—'}</td></tr>
            <tr><td>Latency</td><td className="mono-value">{stats.latency != null ? `${stats.latency}ms` : '—'}</td></tr>
            <tr><td>Fetch Count</td><td>{stats.fetchCount}</td></tr>
            <tr><td>Errors</td><td className={stats.errorCount > 0 ? 'red' : 'green'}>{stats.errorCount}</td></tr>
            <tr><td>Rate Limit</td><td className={RateLimit.remaining() < 5 ? 'red' : 'amber'}>
              {RateLimit.remaining()}/30 ({RateLimit.resetIn()}s)
            </td></tr>
            <tr><td>Stocks Loaded</td><td className="green">{stocks.length}</td></tr>
            <tr><td>Last Scan</td><td className="muted">{fmtTime(stats.lastFetch)}</td></tr>
            <tr><td>Endpoints</td><td className="muted">{Object.keys(ENDPOINTS).length} src · {PROXIES.length} proxy</td></tr>
            <tr><td>Watchlist</td><td className="muted">60 symbols · 2 batches</td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="text-xs amber mb-1" style={{ letterSpacing: '.1em' }}>◈ SCAN LOG</div>
      <div className="log-window" ref={logRef}>
        {logs.length === 0
          ? <span className="dim">— no events —</span>
          : logs.map((l, i) => (
            <div key={i} className={`log-${l.level}`}>
              [{new Date(l.t).toISOString().slice(11, 19)}] {l.msg}
            </div>
          ))
        }
      </div>
      <div className="row gap-2 mt-2">
        <button className="btn btn-green" onClick={onRefresh}>↺ Force Scan</button>
        <button className="btn btn-amber" onClick={onClear}>✕ Clear Log</button>
      </div>
    </div>
  );
}
