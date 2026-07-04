import { useEffect, useRef, useState } from 'react';
import { SESSION } from '../lib/session';
import { VERSION, ENDPOINTS, PROXIES } from '../lib/constants';
import { RateLimit } from '../lib/rateLimit';
import { fmtTime, fmtDuration } from '../lib/formatters';
import { WebGLSupport } from './Telemetry3D';
import type { FetchStats, LogEntry, Pair } from '../types';

interface Props {
  stats:          FetchStats;
  logs:           LogEntry[];
  tokens:         Pair[];
  onClearLogs:    () => void;
  onForceRefresh: () => void;
}

export function AdminPanel({ stats, logs, tokens, onClearLogs, onForceRefresh }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [logs]);

  // Live uptime ticker
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="admin-panel p-4 mb-4">
      <div className="grid-2 gap-4 mb-3">

        {/* ── System ── */}
        <div>
          <div className="text-xs amber mb-2" style={{ letterSpacing: '.1em' }}>◈ SYSTEM</div>
          <table className="diag-table"><tbody>
            <tr><td>Session ID</td><td className="cyan">{SESSION.id}</td></tr>
            <tr><td>JWT Token</td><td className="muted truncate" style={{ maxWidth: 120, fontSize: '.55rem' }}>{SESSION.token.slice(0, 30)}…</td></tr>
            <tr><td>App Version</td><td>{VERSION.app}</td></tr>
            <tr><td>P1 Engine</td><td className="green">{VERSION.p1}</td></tr>
            <tr><td>React</td><td>{VERSION.react}</td></tr>
            <tr><td>Three.js</td><td>{VERSION.three}</td></tr>
            <tr><td>WebGL</td><td className={WebGLSupport.ok ? 'green' : 'red'}>{WebGLSupport.version}</td></tr>
            <tr><td>GPU</td><td className="muted truncate" style={{ maxWidth: 120, fontSize: '.6rem' }}>{WebGLSupport.renderer}</td></tr>
            <tr><td>Uptime</td><td>{fmtDuration(SESSION.uptime * 1000)}</td></tr>
          </tbody></table>
        </div>

        {/* ── Network ── */}
        <div>
          <div className="text-xs amber mb-2" style={{ letterSpacing: '.1em' }}>◈ NETWORK</div>
          <table className="diag-table"><tbody>
            <tr><td>Data Source</td><td className="cyan">{stats.source || '—'}</td></tr>
            <tr><td>Proxied</td><td className={stats.proxied ? 'amber' : 'green'}>{stats.proxied ? 'YES' : 'NO'}</td></tr>
            <tr><td>Latency</td><td className="mono-value">{stats.latency != null ? `${stats.latency}ms` : '—'}</td></tr>
            <tr><td>Fetch Count</td><td>{stats.fetchCount}</td></tr>
            <tr><td>Errors</td><td className={stats.errorCount > 0 ? 'red' : 'green'}>{stats.errorCount}</td></tr>
            <tr><td>Rate Limit</td><td className={RateLimit.remaining() < 5 ? 'red' : 'amber'}>{RateLimit.remaining()}/30 ({RateLimit.resetIn()}s)</td></tr>
            <tr><td>Tokens Loaded</td><td className="cyan">{tokens.length}</td></tr>
            <tr><td>Last Fetch</td><td className="muted">{fmtTime(stats.lastFetch)}</td></tr>
            <tr><td>Endpoints</td><td className="muted">{Object.keys(ENDPOINTS).length} primary, {PROXIES.length} proxy</td></tr>
            <tr><td>Mock Data</td><td className="green">DISABLED</td></tr>
          </tbody></table>
        </div>
      </div>

      {/* ── Event log ── */}
      <div className="text-xs amber mb-1" style={{ letterSpacing: '.1em' }}>◈ EVENT LOG</div>
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
        <button className="btn btn-cyan"  onClick={onForceRefresh}>↺ Force Fetch</button>
        <button className="btn btn-amber" onClick={onClearLogs}>✕ Clear Log</button>
      </div>
    </div>
  );
}
