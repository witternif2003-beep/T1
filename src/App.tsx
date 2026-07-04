import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { computeP1 } from './lib/computeP1';
import { fetchAllEndpoints, normalisePairs, classifyError } from './lib/network';
import { fmtTime } from './lib/formatters';
import { RateLimit } from './lib/rateLimit';
import { SESSION } from './lib/session';
import { VERSION, ENDPOINTS, PROXIES } from './lib/constants';
import { TokenCard }   from './components/TokenCard';
import { AdminPanel }  from './components/AdminPanel';
import { ErrorScreen } from './components/ErrorScreen';
import { Telemetry3D } from './components/Telemetry3D';
import type { Pair, FetchStats, LogEntry, LogAction, SortKey } from './types';

/* ── Log reducer ── */
const MAX_LOGS = 80;
function logReducer(state: LogEntry[], action: LogAction): LogEntry[] {
  if (action.type === 'add')   return [{ t: Date.now(), level: action.level, msg: action.msg }, ...state].slice(0, MAX_LOGS);
  if (action.type === 'clear') return [];
  return state;
}

/* ── Stat panel ── */
function StatPanel({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="panel p-3 text-center">
      <div className="panel-top-line" />
      <div className="text-xl font-bold" style={{ color, marginTop: '.25rem' }}>{value}</div>
      <div className="text-xs muted mt-1">{label}</div>
    </div>
  );
}

export default function App() {
  const [tokens,        setTokens]        = useState<Pair[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [errorType,     setErrorType]     = useState<string | null>(null);
  const [isStale,       setIsStale]       = useState(false);
  const [refreshSec,    setRefreshSec]    = useState(30);
  const [minP1,         setMinP1]         = useState(0);
  const [sortKey,       setSortKey]       = useState<SortKey>('p1');
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [showAdmin,     setShowAdmin]     = useState(false);
  const [elapsed,       setElapsed]       = useState<number | null>(null);
  const [fetchStats,    setFetchStats]    = useState<FetchStats>({
    source: '—', proxied: false, latency: null, fetchCount: 0, errorCount: 0, lastFetch: null,
  });

  const [logs, dispatchLog] = useReducer(logReducer, []);
  const log = useCallback((level: LogEntry['level'], msg: string) => dispatchLog({ type: 'add', level, msg }), []);

  const fetchCountRef  = useRef(0);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchTs    = useRef<number | null>(null);
  const refreshSecRef  = useRef(refreshSec);
  useEffect(() => { refreshSecRef.current = refreshSec; }, [refreshSec]);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setError(null); setErrorType(null); setIsStale(false);
    if (staleRef.current) clearTimeout(staleRef.current);
    fetchCountRef.current += 1;
    log('admin', `Fetch #${fetchCountRef.current} — session ${SESSION.id}`);

    const result = await fetchAllEndpoints(log);

    setFetchStats(prev => ({
      source:     result.source     ?? '—',
      proxied:    result.proxied    ?? false,
      latency:    result.latency    ?? null,
      fetchCount: prev.fetchCount + 1,
      errorCount: result.ok ? prev.errorCount : prev.errorCount + 1,
      lastFetch:  Date.now(),
    }));

    if (result.ok) {
      const pairs = normalisePairs(result.data);
      if (pairs.length > 0) {
        setTokens(pairs); setError(null); setErrorType(null);
        lastFetchTs.current = Date.now(); setLoading(false);
        staleRef.current = setTimeout(() => setIsStale(true), refreshSecRef.current * 2 * 1000);
        log('ok', `✓ ${pairs.length} tokens · ${result.source}${result.proxied ? ' (proxied)' : ''} · ${result.latency}ms — VERIFIED LIVE`);
        return;
      }
      log('err', `Response OK but 0 valid Solana pairs (${result.source})`);
      setError('API returned 0 valid token pairs');
      setErrorType('parse');
    } else {
      log('err', `All sources failed: ${result.error}`);
      setError(result.error ?? 'No data');
      setErrorType(classifyError(result.error));
    }

    // Hard failure — no mock data ever
    setTokens([]);
    lastFetchTs.current = Date.now();
    setLoading(false);
  }, [log]);

  // Initial fetch
  useEffect(() => { fetchTokens(); }, []); // eslint-disable-line

  // Auto-refresh (stable — only resets when slider changes)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => fetchTokens(), refreshSec * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshSec]); // eslint-disable-line

  // Elapsed ticker
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastFetchTs.current) setElapsed(Math.round((Date.now() - lastFetchTs.current) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (staleRef.current) clearTimeout(staleRef.current);
    };
  }, []);

  const processed = useMemo(() => tokens
    .map(t => ({ ...t, _p1: computeP1(t) }))
    .filter(t => t._p1.score >= minP1)
    .sort((a, b) => {
      if (sortKey === 'p1')       return b._p1.score - a._p1.score;
      if (sortKey === 'vol')      return (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0);
      if (sortKey === 'price')    return (b.priceChange?.m5 ?? 0) - (a.priceChange?.m5 ?? 0);
      if (sortKey === 'liq')      return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
      if (sortKey === 'momentum') return b._p1.momentum - a._p1.momentum;
      return 0;
    }), [tokens, minP1, sortKey]);

  const topP1      = processed[0]?._p1?.score ?? 0;
  const avgP1      = processed.length ? Math.round(processed.reduce((s, t) => s + t._p1.score, 0) / processed.length) : 0;
  const surgeCount = processed.filter(t => t._p1.score >= 70).length;
  const momCount   = processed.filter(t => t._p1.momentum > 70).length;

  const hasError = !loading && !!error;
  const dotClass = loading ? 'dot-warn' : hasError ? 'dot-dead' : 'dot-live';

  return (
    <div className="app-container">

      {/* ── Header ── */}
      <div className="row-between mb-3" style={{ paddingTop: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h1 className="text-2xl font-bold surge-glow cyan" style={{ letterSpacing: '-.5px' }}>
            ◈ SOLANA SURGE SCANNER
          </h1>
          <div className="row gap-2 mt-1 text-xs muted">
            <div className={dotClass} />
            {loading   ? <span className="amber">Fetching…</span>
           : hasError  ? <span className="red">DATA ERROR</span>
           :              <span className="green">LIVE VERIFIED</span>}
            <span className="dim">·</span>
            <span>{processed.length} tokens</span>
            <span className="dim">·</span>
            <span>P1 {VERSION.p1}</span>
            {elapsed != null && !loading && !hasError && (
              <><span className="dim">·</span><span>{elapsed}s ago</span></>
            )}
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-purple" onClick={() => setShowAdmin(v => !v)}>
            {showAdmin ? '▼ Admin' : '▲ Admin'}
          </button>
          <button className="btn btn-cyan" onClick={fetchTokens} disabled={loading}>
            {loading ? 'Loading…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* ── Status banners ── */}
      {hasError && (
        <div className="banner banner-err">
          <strong className="red">✗ NO LIVE DATA</strong>
          {` — ${{ cors: 'CORS blocked', network: 'No network', timeout: 'Timed out', http: 'Server error', parse: 'Parse/integrity error', unknown: 'All endpoints exhausted' }[errorType ?? 'unknown'] ?? errorType} — Retry or check network`}
        </div>
      )}
      {!hasError && !loading && fetchStats.proxied && (
        <div className="banner banner-cors">
          <strong className="cyan">ℹ CORS PROXY</strong>
          {` — via proxy · ${fetchStats.source} · ${fetchStats.latency}ms · LIVE DATA`}
        </div>
      )}
      {isStale && !loading && !hasError && (
        <div className="banner banner-stale">
          <strong className="amber">⏱ STALE</strong>
          {` — No update in ${refreshSec * 2}s — check connection`}
        </div>
      )}
      {!hasError && !loading && !fetchStats.proxied && (
        <div className="banner banner-ok">
          <strong className="green">✓ LIVE DATA</strong>
          {` — ${fetchStats.source} · ${fetchStats.latency}ms · ${fmtTime(fetchStats.lastFetch)} · DexScreener verified`}
        </div>
      )}

      {/* ── Admin Panel ── */}
      {showAdmin && (
        <AdminPanel
          stats={fetchStats}
          logs={logs}
          tokens={tokens}
          onClearLogs={() => dispatchLog({ type: 'clear' })}
          onForceRefresh={fetchTokens}
        />
      )}

      {/* ── Stats strip ── */}
      {!hasError && tokens.length > 0 && (
        <div className="grid-4 mb-3">
          <StatPanel label="Top P1"        value={topP1}      color="var(--cyan)"   />
          <StatPanel label="Avg P1"        value={avgP1}      color="var(--purple)" />
          <StatPanel label="Surge Alerts"  value={surgeCount} color="var(--green)"  />
          <StatPanel label="High Momentum" value={momCount}   color="var(--orange)" />
        </div>
      )}

      {/* ── Controls ── */}
      {!hasError && tokens.length > 0 && (
        <div className="panel p-4 mb-3">
          <div className="panel-top-line" />
          <div className="grid-3" style={{ marginTop: '.5rem' }}>
            <div>
              <label className="text-xs muted ctrl-label">Sort by</label>
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
                <option value="p1">P1 Score</option>
                <option value="momentum">Momentum</option>
                <option value="vol">Volume 24h</option>
                <option value="price">Price Δ 5m</option>
                <option value="liq">Liquidity</option>
              </select>
            </div>
            <div>
              <label className="text-xs muted ctrl-label">Min P1: <span className="cyan">{minP1}</span></label>
              <input type="range" min="0" max="90" step="5" value={minP1}
                onChange={e => setMinP1(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs muted ctrl-label">Refresh: <span className="cyan">{refreshSec}s</span></label>
              <input type="range" min="10" max="120" step="5" value={refreshSec}
                onChange={e => setRefreshSec(Number(e.target.value))} />
            </div>
          </div>
          <div className="row gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
            <button
              className={`btn ${showTelemetry ? 'btn-purple' : 'btn-cyan'}`}
              onClick={() => setShowTelemetry(v => !v)}
            >
              {showTelemetry ? '▼ Hide 3D' : '▲ Show 3D Telemetry'}
            </button>
            <span className="text-xs muted" style={{ alignSelf: 'center' }}>
              Rate limit: <span className={RateLimit.remaining() < 5 ? 'red' : 'amber'}>{RateLimit.remaining()}</span>/30 remaining
            </span>
          </div>
        </div>
      )}

      {/* ── 3D Telemetry ── */}
      {showTelemetry && tokens.length > 0 && (
        <div className="mb-3">
          <div className="text-xs muted mb-1">
            3D vol chart · top 6 by h1 · white needle = P1 · orange torus = momentum &gt;70
          </div>
          <Telemetry3D tokens={tokens} />
        </div>
      )}

      {/* ── Main content ── */}
      {loading && tokens.length === 0 ? (
        <div className="panel p-6 text-center cyan">
          <div className="text-lg mb-2 surge-glow">◈</div>
          <div className="text-xs" style={{ color: 'var(--amber)' }}>Scanning Solana network…</div>
          <div className="text-xs muted mt-2">
            Trying {Object.keys(ENDPOINTS).length} endpoints · {PROXIES.length} proxy fallbacks each
          </div>
        </div>
      ) : hasError ? (
        <ErrorScreen
          error={error}
          errorType={errorType}
          fetchCount={fetchCountRef.current}
          logs={logs}
          onRetry={fetchTokens}
        />
      ) : processed.length === 0 ? (
        <div className="panel p-6 text-center muted">
          No tokens match Min P1 ≥ {minP1}. Lower the threshold.
        </div>
      ) : (
        <div className="token-grid">
          {processed.map((pair, i) => (
            <TokenCard
              key={pair.pairAddress || pair.baseToken?.address || i}
              pair={pair}
              rank={i + 1}
            />
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="footer-note">
        Solana Surge Scanner {VERSION.app} · P1 {VERSION.p1} · DexScreener API ·
        {' '}Session {SESSION.id} · Live data only · Not financial advice
      </div>

      {/* ── Background decorators ── */}
      <div className="bg-grid" />
      <div className="bg-scanlines" />
    </div>
  );
}

