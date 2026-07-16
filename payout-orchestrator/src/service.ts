import type { Server } from 'node:http';
import express from 'express';
import cron, { type ScheduledTask } from 'node-cron';
import { timingSafeEqual } from 'node:crypto';

import type { OrchestratorConfig } from './config.js';
import { AuditLogger } from './audit-log.js';
import { PayoutEngine, type PayoutResult } from './engine.js';
import { log } from './logger.js';
import { RpcRouter } from './rpc-router.js';

export class OrchestratorService {
  public readonly router: RpcRouter;
  private readonly engine: PayoutEngine;
  private readonly audit: AuditLogger;
  private scheduler: ScheduledTask | null = null;
  private server: Server | null = null;
  private paused = false;
  private fatalError: string | null = null;
  private lastRunAt = 0;
  private lastResult: PayoutResult | null = null;

  public constructor(public readonly config: OrchestratorConfig) {
    this.router = new RpcRouter(config.rpcEndpoints);
    this.audit = new AuditLogger(config.auditLogPath);
    this.engine = new PayoutEngine(config, this.router, this.audit);
  }

  public async initialize(): Promise<void> {
    try {
      await this.audit.initialize();
    } catch (error) {
      this.fatalError = String(error);
      throw error;
    }
  }

  public startScheduler(): void {
    this.scheduler = cron.schedule(this.config.schedule, () => {
      void this.runScheduled();
    });
    log('info', 'Scheduler started', { schedule: this.config.schedule });
  }

  public async runScheduled(): Promise<PayoutResult | null> {
    if (this.paused) {
      log('info', 'Payout skipped because circuit breaker is open');
      return null;
    }
    if (Date.now() - this.lastRunAt < this.config.minIntervalMs) {
      log('info', 'Payout skipped because recipient rate limit is active');
      return null;
    }
    this.lastRunAt = Date.now();
    this.lastResult = await this.engine.runOnce();
    return this.lastResult;
  }

  public async startControlPlane(): Promise<void> {
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    app.get('/healthz', async (_request, response) => {
      const health = await this.router.healthCheck();
      response.status(health.healthy && !this.fatalError ? 200 : 503).json({
        ok: health.healthy && !this.fatalError,
        rpc: health.rpc ?? null,
        slot: health.slot ?? null,
        fatalError: this.fatalError,
      });
    });
    app.get('/status', (_request, response) => {
      response.json({
        paused: this.paused,
        fatalError: this.fatalError,
        lastResult: this.lastResult,
      });
    });
    app.post('/pause', (request, response) => {
      if (!this.authorized(request.header('authorization'))) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }
      this.paused = true;
      response.json({ paused: true });
    });
    app.post('/resume', (request, response) => {
      if (!this.authorized(request.header('authorization'))) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }
      this.paused = false;
      response.json({ paused: false });
    });
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(this.config.pauseApiPort, '127.0.0.1', () => resolve());
      server.once('error', reject);
      this.server = server;
    });
    log('info', 'Control plane started', { port: this.config.pauseApiPort });
  }

  public async shutdown(): Promise<void> {
    this.scheduler?.stop();
    if (this.server) {
      await new Promise<void>(resolve => this.server?.close(() => resolve()));
      this.server = null;
    }
  }

  private authorized(header: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.config.pauseApiKey}`);
    const supplied = Buffer.from(header ?? '');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }
}
