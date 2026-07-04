import { VERSION } from './constants';
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const sid  = Math.random().toString(36).slice(2,10).toUpperCase();
const iat  = Math.floor(Date.now()/1000);
const started = Date.now();
export const SESSION = {
  id: sid,
  token: `${b64({alg:'HS256-NSA',typ:'JWT'})}.${b64({sub:'nsa-stocks',sid,iat,iss:'surge-detector'})}.${b64({v:VERSION.app})}`,
  get uptime() { return Math.round((Date.now()-started)/1000); },
} as const;
