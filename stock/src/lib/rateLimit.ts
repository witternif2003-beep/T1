import { RATE_LIMIT_MAX, RATE_LIMIT_MS } from './constants';
let hits=0, resetAt=Date.now()+RATE_LIMIT_MS;
function refresh(){ if(Date.now()>resetAt){hits=0;resetAt=Date.now()+RATE_LIMIT_MS;} }
export const RateLimit = {
  check(){ refresh(); if(hits>=RATE_LIMIT_MAX)return false; hits++; return true; },
  remaining(){ refresh(); return Math.max(0,RATE_LIMIT_MAX-hits); },
  resetIn()  { return Math.max(0,Math.round((resetAt-Date.now())/1000)); },
};
