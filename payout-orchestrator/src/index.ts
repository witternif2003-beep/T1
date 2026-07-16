import { loadConfig } from './config.js';
import { log } from './logger.js';
import { OrchestratorService } from './service.js';

const service = new OrchestratorService(loadConfig());

try {
  await service.initialize();
  await service.startControlPlane();
  service.startScheduler();
} catch (error) {
  log('error', 'Failed to start payout orchestrator', { error: String(error) });
  process.exitCode = 1;
}

const shutdown = async (signal: string): Promise<void> => {
  log('info', 'Shutting down', { signal });
  await service.shutdown();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
