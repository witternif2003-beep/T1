import { useRef, useEffect } from 'react';
import { SESSION } from '../lib/session';
import { ENDPOINTS, PROXIES } from '../lib/constants';
import type { LogEntry } from '../types';

const ERROR_LABELS: Record<string, string> = {
  cors:    'CORS / browser blocked the request',
  network: 'No network connectivity',
  timeout: 'Request timed out',
  http:    'Server returned an error',
  parse:   'Response failed integrity check',
  unknown: 'All endpoints and proxy fallbacks exhausted',
};

interface Props {
  error:      string | null;
  errorType:  string | null;
  fetchCount: number;
  logs:       LogEntry[];
  onRetry:    () => void;
}

export function ErrorScreen({ error, errorType, fetchCount, logs, onRetry }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const label = errorType ? (ERROR_LABELS[errorType] ?? errorType) : ERROR_LABELS.unknown;

  return (
    <div className="error-screen">
      <div className="error-icon">⛔</div>
      <div className="font-bold text-lg red mb-2">LIVE DATA UNAVAILABLE</div>
      <div className="text-xs muted mb-3">
        {label}<br />
        No mock data will be displayed. Only verified live tokens are shown.
      </div>

      {error && (
        <div className="error-raw">
          {error}
        </div>
      )}

      <button className="btn btn-red mb-3" onClick={onRetry} style={{ fontSize: '.8rem' }}>
        ↺ Retry Now
      </button>

      <div className="error-meta text-xs muted">
        Attempt #{fetchCount} · Session {SESSION.id}<br />
        Endpoints tried: {Object.keys(ENDPOINTS).length} · Proxies per endpoint: {PROXIES.length}
      </div>

      {logs.length > 0 && (
        <div style={{ marginTop: '1rem', textAlign: 'left' }}>
          <div className="text-xs muted mb-1" style={{ letterSpacing: '.08em' }}>◈ FETCH LOG</div>
          <div className="log-window" ref={logRef} style={{ height: 120 }}>
            {[...logs].reverse().map((l, i) => (
              <div key={i} className={`log-${l.level}`}>
                [{new Date(l.t).toISOString().slice(11, 19)}] {l.msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
