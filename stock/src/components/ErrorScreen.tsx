import { useRef, useEffect } from 'react';
import { SESSION } from '../lib/session';
import { ENDPOINTS, PROXIES } from '../lib/constants';
import type { LogEntry } from '../types';

const LABELS:Record<string,string>={
  cors:'CORS / browser blocked request',network:'No network connectivity',
  timeout:'Request timed out',http:'Server error',unknown:'All endpoints exhausted',
};

export function ErrorScreen({error,errorType,fetchCount,logs,onRetry}:{
  error:string|null;errorType:string|null;fetchCount:number;logs:LogEntry[];onRetry:()=>void;
}){
  const logRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},[logs]);

  return(
    <div className="error-screen">
      <div className="error-icon">⛔</div>
      <div className="font-bold text-lg red mb-2">MARKET DATA UNAVAILABLE</div>
      <div className="text-xs muted mb-3">
        {LABELS[errorType??'unknown']}<br/>
        NYSE/AMEX markets may be closed (Mon-Fri 09:30–16:00 ET).<br/>
        No mock data — only verified live prices are shown.
      </div>
      {error&&<div className="error-raw">{error}</div>}
      <button className="btn btn-red mb-3" onClick={onRetry} style={{fontSize:'.8rem'}}>↺ Retry Scan</button>
      <div className="error-meta text-xs muted">
        Attempt #{fetchCount} · Session {SESSION.id}<br/>
        Sources: {Object.keys(ENDPOINTS).length} endpoints · {PROXIES.length} CORS proxies
      </div>
      {logs.length>0&&(
        <div style={{marginTop:'1rem',textAlign:'left'}}>
          <div className="text-xs muted mb-1">◈ SCAN LOG</div>
          <div className="log-window" ref={logRef} style={{height:110}}>
            {[...logs].reverse().map((l,i)=>(
              <div key={i} className={`log-${l.level}`}>[{new Date(l.t).toISOString().slice(11,19)}] {l.msg}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
