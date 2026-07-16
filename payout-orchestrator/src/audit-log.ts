import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEntry {
  timestamp: string;
  recipient: string;
  mint: string;
  amountHuman: string;
  amountRaw: string;
  signature: string | null;
  status: 'confirmed' | 'dead-letter';
  rpc: string | null;
  attemptCount: number;
  prevHash: string | null;
  hash?: string;
}

export class AuditLogger {
  private previousHash: string | null = null;

  public constructor(private readonly path: string) {}

  public async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const content = await readFile(this.path, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const last = lines.at(-1);
      if (last) {
        const parsed: unknown = JSON.parse(last);
        if (!parsed || typeof parsed !== 'object' || typeof (parsed as { hash?: unknown }).hash !== 'string') {
          throw new Error('Audit log last record has no hash');
        }
        this.previousHash = (parsed as { hash: string }).hash;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  public async append(entry: Omit<AuditEntry, 'prevHash' | 'hash'>): Promise<AuditEntry> {
    const withoutHash: AuditEntry = { ...entry, prevHash: this.previousHash };
    const hash = createHash('sha256').update(JSON.stringify(withoutHash)).digest('hex');
    const record: AuditEntry = { ...withoutHash, hash };
    await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8');
    this.previousHash = hash;
    return record;
  }
}
