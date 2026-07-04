import { VERSION } from './constants';

const b64 = (obj: object): string =>
  btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const sid     = Math.random().toString(36).slice(2, 10).toUpperCase();
const iat     = Math.floor(Date.now() / 1000);
const header  = b64({ alg: 'HS256-NSA', typ: 'JWT' });
const payload = b64({ sub: 'nsa-admin', sid, iat, iss: 'surge-scanner' });
const sig     = b64({ v: VERSION.app });

const startedAt = Date.now();

export const SESSION = {
  id:    sid,
  token: `${header}.${payload}.${sig}`,
  get uptime(): number {
    return Math.round((Date.now() - startedAt) / 1000);
  },
} as const;
