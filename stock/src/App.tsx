import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { computeP1 } from './lib/computeP1';
import { fetchAllEndpoints, classifyError, isMarketOpen, marketStatusMsg } from './lib/network';
import { fmtTime, fmtUSD } from './lib/formatters';
import { RateLimit } from './lib/rateLimit';
import { SESSION } from './lib/session';
import { VERSION, ENDPOINTS, PROXIES, MAX_PRICE_USD, SURGE_THRESHOLD } from './lib/constants';
import { StockCard }   from './components/StockCard';
import { AdminPanel }  from './components/AdminPanel';
import { ErrorScreen } from './components/ErrorScreen';
import { Telemetry3D } from './components/Telemetry3D';
import type { Stock, FetchStats, LogEntry, LogAction } from './types';

const MAX_LOGS = 80;
function logReducer(state: LogEntry[], action: LogAction): LogEntry[] {
  if (action.type === 'add')   return [{ t: Date.now(), level: action.level, msg: action.msg }, ...state].slice(0, MAX_LOGS);
  if (action.type === 'clear') return [];
  return state;
}

type SortKey = 'imminent' | 'p1' | 'vol' | 'change' | 'squeeze';

function Stat({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="panel p-3 text-center">
      <div className="panel-top-line" />
      <div className="text-xl font-bold" style={{ color, marginTop: '.25rem' }}>{value}</div>
      <div className="text-xs muted mt-1">{label}</div>
      {sub && <div className="text-xs" style={{ color: 'rgba(255,170,0,.5)', marginTop: '2px', fontSize: '.55rem' }}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [stocks,     setStocks]     = useState<Stock[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [errorType,  setErrorType]  = useState<string | null>(null);
  const [isStale,    setIsStale]    = useState(false);
  const [refreshSec, setRefreshSec] = useState(30);
  const [minP1,      setMinP1]      = useState(0);
  const [sortKey,    setSortKey]    = useState<SortKey>('imminent');
  const [show3D,     setShow3D]     = useState(false);
  const [showAdmin,  setShowAdmin]  = useState(false);
  const [elapsed,    setElapsed]    = useState<number | null>(null);
  const [scanCount,  setScanCount]  = useState(0);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const [fetchStats, setFetchStats] = useState<FetchStats>({
    source: '—', proxied: false, latency: null, fetchCount: 0, errorCount: 0, lastFetch: null,
  });

  const [logs, dispatch] = useReducer(logReducer, []);
  const log = useCallback((level: LogEntry['level'], msg: string) => dispatch({ type: 'add', level, msg }), []);

  const fetchCountRef = useRef(0);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleRef      = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchTs   = useRef<number | null>(null);
  const refreshRef    = useRef(refreshSec);
  useEffect(() => { refreshRef.current = refreshSec; }, [refreshSec]);

  // Market open/close checker — every 60s
  useEffect(() => {
    const id = setInterval(() => setMarketOpen(isMarketOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    setError(null); setErrorType(null); setIsStale(false);
    if (staleRef.current) clearTimeout(staleRef.current);
    fetchCountRef.current += 1;
    setScanCount(c => c + 1);
    log('admin', `Scan #${fetchCountRef.current} — ${marketStatusMsg()} — session ${SESSION.id}`);

    const result = await fetchAllEndpoints(log);

    setFetchStats(prev => ({
      source:     result.source,
      proxied:    result.proxied,
      latency:    result.latency,
      fetchCount: prev.fetchCount + 1,
      errorCount: result.ok ? prev.errorCount : prev.errorCount + 1,
      lastFetch:  Date.now(),
    }));

    if (result.ok && result.stocks.length > 0) {
      setStocks(result.stocks);
      setError(null); setErrorType(null);
      lastFetchTs.current = Date.now();
      setLoading(false);
      staleRef.current = setTimeout(() => setIsStale(true), refreshRef.current * 2 * 1000);
      log('ok', `✓ ${result.stocks.length} penny stocks ready for P1 analysis`);
      return;
    }

    // Hard failure — live data only
    setStocks([]);
    setError(result.error ?? 'No data');
    setErrorType(classifyError(result.error));
    lastFetchTs.current = Date.now();
    setLoading(false);
  }, [log]);

  const handleFetchFailure = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setStocks([]);
    setLoading(false);
    setFetchStats(prev => ({
      ...prev,
      fetchCount: prev.fetchCount + 1,
      errorCount: prev.errorCount + 1,
      lastFetch: Date.now(),
    }));
    setError(message || 'Unexpected stock scanner error');
    setErrorType(classifyError(message));
    log('err', `Unexpected stock scanner error: ${message}`);
  }, [log]);

  const runFetchStocks = useCallback(() => {
    void fetchStocks().catch(handleFetchFailure);
  }, [fetchStocks, handleFetchFailure]);

  useEffect(() => { runFetchStocks(); }, [runFetchStocks]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(runFetchStocks, refreshSec * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshSec, runFetchStocks]);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastFetchTs.current) setElapsed(Math.round((Date.now() - lastFetchTs.current) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (staleRef.current) clearTimeout(staleRef.current);
    };
  }, []);

  const processed = useMemo(() => {
    const scored = stocks
      .map(s => ({ ...s, _p1: computeP1(s) }))
      .filter(s => s._p1.score >= minP1);
    scored.sort((a, b) => {
      if (sortKey === 'imminent') return b._p1.imminentScore - a._p1.imminentScore;
      if (sortKey === 'p1')       return b._p1.score         - a._p1.score;
      if (sortKey === 'vol')      return b._p1.volRatio       - a._p1.volRatio;
      if (sortKey === 'change')   return b.changePct          - a.changePct;
      if (sortKey === 'squeeze')  return (b._p1.squeezeSetup ? 1 : 0) - (a._p1.squeezeSetup ? 1 : 0)
                                       || b._p1.darkPool - a._p1.darkPool;
      return 0;
    });
    return scored.slice(0, 30);
  }, [stocks, minP1, sortKey]);

  const topScore    = processed[0]?._p1?.imminentScore ?? 0;
  const surgeCount  = processed.filter(s => s._p1.imminentScore >= SURGE_THRESHOLD).length;
  const sqzCount    = processed.filter(s => s._p1.squeezeSetup).length;
  const dpCount     = processed.filter(s => s._p1.darkPool >= 50).length;
  const closedNote  = !marketOpen ? '±Fri close' : undefined;

  const hasError  = !loading && !!error;
  const dotClass  = loading ? 'dot-warn' : hasError ? 'dot-dead' : 'dot-live';
  const errLabels: Record<string, string> = {
    cors: 'CORS blocked', network: 'No network', timeout: 'Timed out',
    http: 'Server error', market: 'Market closed / no data', unknown: 'All sources failed',
  };

  return (
    <div className="app-container">

      {/* ── Header ── */}
      <div className="row-between mb-3" style={{ paddingTop: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h1 className="text-2xl font-bold surge-glow green" style={{ letterSpacing: '-.5px' }}>
            $ NYSE PENNY SURGE DETECTOR
          </h1>
          <div className="row gap-2 mt-1 text-xs muted">
            <div className={dotClass} />
            {loading
              ? <><span className="amber">Scanning…</span><div className="scanning-bar" style={{ width: 60 }} /></>
              : hasError ? <span className="red">DATA ERROR</span>
              :             <span className="green">LIVE VERIFIED</span>}
            <span className="dim">·</span>
            <span className={marketOpen ? 'green' : 'amber'}>
              {marketOpen ? 'Market Open' : marketStatusMsg()}
            </span>
            <span className="dim">·</span>
            <span>≤${MAX_PRICE_USD.toFixed(2)} · Scan #{scanCount}</span>
            {elapsed != null && !loading && !hasError && (
              <><span className="dim">·</span><span>{elapsed}s ago</span></>
            )}
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-purple" onClick={() => setShowAdmin(v => !v)}>
            {showAdmin ? '▼ Admin' : '▲ Admin'}
          </button>
          <button className="btn btn-green" onClick={runFetchStocks} disabled={loading}>
            {loading ? 'Scanning…' : '↺ Scan Now'}
          </button>
        </div>
      </div>

      {/* ── Banners ── */}
      {hasError && (
        <div className="banner banner-err">
          <strong className="red">✗ NO DATA</strong>
          {` — ${errLabels[errorType ?? 'unknown'] ?? errorType} — ${marketStatusMsg()}`}
        </div>
      )}
      {!hasError && !loading && fetchStats.proxied && (
        <div className="banner banner-cors">
          <strong className="cyan">ℹ CORS PROXY</strong>
          {` — ${fetchStats.source} · ${fetchStats.latency}ms · LIVE`}
        </div>
      )}
      {!hasError && !loading && !fetchStats.proxied && fetchStats.source !== '—' && (
        <div className="banner banner-ok">
          <strong className="green">✓ LIVE</strong>
          {` — ${fetchStats.source} · ${fetchStats.latency}ms · ${fmtTime(fetchStats.lastFetch)} · Yahoo Finance`}
        </div>
      )}
      {isStale && !loading && !hasError && (
        <div className="banner banner-stale">
          <strong className="amber">⏱ STALE</strong> — No update in {refreshSec * 2}s
        </div>
      )}
      {!marketOpen && !hasError && stocks.length > 0 && (
        <div className="banner banner-stale">
          <strong className="amber">🕐 {marketStatusMsg()}</strong>
          {' — Showing last available prices. NYSE Mon–Fri 09:30–16:00 ET. Surge scores reflect last-session momentum.'}
        </div>
      )}

      {/* ── Admin Panel ── */}
      {showAdmin && (
        <AdminPanel
          stats={fetchStats} logs={logs} stocks={stocks}
          onClear={() => dispatch({ type: 'clear' })}
          onRefresh={runFetchStocks}
        />
      )}

      {/* ── Stats strip ── */}
      {!hasError && stocks.length > 0 && (
        <div className="grid-4 mb-3">
          <Stat label="Top Surge Score"  value={topScore}   color="var(--green)"  sub={closedNote} />
          <Stat label={`Surge ≥${SURGE_THRESHOLD}`} value={surgeCount} color="var(--amber)"  sub={closedNote} />
          <Stat label="Squeeze Setups"   value={sqzCount}   color="var(--red)"    />
          <Stat label="Dark Pool Hits"   value={dpCount}    color="var(--purple)" />
        </div>
      )}

      {/* ── Controls ── */}
      {!hasError && stocks.length > 0 && (
        <div className="panel p-4 mb-3">
          <div className="panel-top-line" />
          <div className="grid-3" style={{ marginTop: '.5rem' }}>
            <div>
              <label className="text-xs muted ctrl-label">Sort by</label>
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
                <option value="imminent">Surge Score</option>
                <option value="p1">P1 Score</option>
                <option value="vol">Volume Ratio</option>
                <option value="change">% Change</option>
                <option value="squeeze">Squeeze Setup</option>
              </select>
            </div>
            <div>
              <label className="text-xs muted ctrl-label">Min P1: <span className="green">{minP1}</span></label>
              <input type="range" min="0" max="90" step="5" value={minP1}
                onChange={e => setMinP1(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs muted ctrl-label">
                Refresh: <span className="green">{refreshSec}s</span>
                {refreshSec <= 20 && <span className="green" style={{ marginLeft: '.3rem' }}>● LIVE</span>}
              </label>
              <input type="range" min="15" max="120" step="5" value={refreshSec}
                onChange={e => setRefreshSec(Number(e.target.value))} />
            </div>
          </div>
          <div className="row gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
            <button className={`btn ${show3D ? 'btn-purple' : 'btn-green'}`}
              onClick={() => setShow3D(v => !v)}>
              {show3D ? '▼ Hide 3D' : '▲ 3D Telemetry'}
            </button>
            <span className="text-xs muted" style={{ alignSelf: 'center' }}>
              Rate: <span className={RateLimit.remaining() < 5 ? 'red' : 'amber'}>{RateLimit.remaining()}</span>/30
              · {processed.length} of {stocks.length} shown
            </span>
          </div>
        </div>
      )}

      {/* ── 3D Telemetry ── */}
      {show3D && stocks.length > 0 && (
        <div className="mb-3">
          <div className="text-xs muted mb-1">
            3D surge chart · top 6 · white needle = P1 · red ring = squeeze setup
          </div>
          <Telemetry3D stocks={stocks} />
        </div>
      )}

      {/* ── Surge candidates header ── */}
      {!hasError && processed.length > 0 && (
        <div className="scan-header mb-3">
          <div className="row gap-2">
            <div className="scan-pulse" />
            <span className="scan-title">$ IMMINENT SURGE CANDIDATES</span>
            <span className="text-xs muted">
              Top {processed.length} of {stocks.length} · sub-${MAX_PRICE_USD.toFixed(2)} · ranked by Surge Score
            </span>
          </div>
          <div className="scan-meta">
            <span className="purple">🌑 Dark Pool = buy-absorption inference</span>
            {'  '}
            <span className="red">🚨 SQZ = squeeze (high short float + rising price + volume)</span>
            {'  '}
            {!marketOpen && <span className="amber">⚠ Market closed — scores from last session</span>}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {loading && stocks.length === 0 ? (
        <div className="panel p-6 text-center green">
          <div className="text-lg mb-2 surge-glow">$</div>
          <div className="text-xs" style={{ color: 'var(--amber)' }}>
            Scanning {Object.keys(ENDPOINTS).length} sources for sub-${MAX_PRICE_USD.toFixed(2)} stocks…
          </div>
          <div className="scanning-bar" style={{ width: '100%', margin: '.5rem 0' }} />
          <div className="text-xs muted">
            Merging watchlist ({60} symbols) + screeners · {marketStatusMsg()}
          </div>
        </div>
      ) : hasError ? (
        <ErrorScreen
          error={error} errorType={errorType}
          fetchCount={fetchCountRef.current}
          logs={logs} onRetry={runFetchStocks}
        />
      ) : processed.length === 0 ? (
        <div className="panel p-6 text-center muted">
          No stocks match Min P1 ≥ {minP1}. Lower the threshold.
        </div>
      ) : (
        <div className="token-grid">
          {processed.map((s, i) => (
            <StockCard key={s.symbol} stock={s} rank={i + 1} />
          ))}
        </div>
      )}

      <div className="footer-note">
        NYSE Penny Surge Detector {VERSION.app} · P1 {VERSION.p1} · Yahoo Finance (15-min delayed) ·
        {' '}Session {SESSION.id} · Surge score ≥{SURGE_THRESHOLD} = alert · Not financial advice
      </div>
      <div className="bg-grid" />
      <div className="bg-scanlines" />
    </div>
  );
}
