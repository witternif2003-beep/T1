export const fmtUSD = (v: number|null|undefined, dec=4): string => {
  if(v==null||isNaN(v)) return '—';
  if(v===0) return '$0.00';
  if(v<0.0001) return `$${v.toExponential(2)}`;
  if(v<0.01)   return `$${v.toFixed(6)}`;
  if(v<1)      return `$${v.toFixed(dec)}`;
  return `$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
};
export const fmtPct = (v: number|null|undefined): string => {
  if(v==null||isNaN(v)) return '—';
  return `${v>=0?'+':''}${v.toFixed(2)}%`;
};
export const fmtVol = (v: number|null|undefined): string => {
  if(v==null||isNaN(v)||v===0) return '—';
  if(v>=1e9) return `${(v/1e9).toFixed(2)}B`;
  if(v>=1e6) return `${(v/1e6).toFixed(2)}M`;
  if(v>=1e3) return `${(v/1e3).toFixed(1)}K`;
  return `${v.toFixed(0)}`;
};
export const fmtTime = (ts: number|null|undefined): string =>
  ts ? new Date(ts).toLocaleTimeString([],{hour12:false}) : '—';
export const fmtDuration = (ms: number): string =>
  ms<1000?`${ms}ms`:ms<60000?`${(ms/1000).toFixed(1)}s`:`${Math.floor(ms/60000)}m ${Math.round((ms%60000)/1000)}s`;
