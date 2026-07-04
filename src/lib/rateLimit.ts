import { RATE_LIMIT_MAX, RATE_LIMIT_MS } from './constants';

let hits    = 0;
let resetAt = Date.now() + RATE_LIMIT_MS;

function refresh(): void {
  if (Date.now() > resetAt) {
    hits    = 0;
    resetAt = Date.now() + RATE_LIMIT_MS;
  }
}

export const RateLimit = {
  check(): boolean {
    refresh();
    if (hits >= RATE_LIMIT_MAX) return false;
    hits++;
    return true;
  },
  remaining(): number {
    refresh();
    return Math.max(0, RATE_LIMIT_MAX - hits);
  },
  resetIn(): number {
    return Math.max(0, Math.round((resetAt - Date.now()) / 1000));
  },
};
