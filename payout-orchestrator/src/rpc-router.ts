import { Connection } from '@solana/web3.js';

import { log } from './logger.js';

export interface RpcEndpoint {
  url: string;
  connection: Connection;
}

export class RpcRouter {
  private readonly endpoints: RpcEndpoint[];
  private cursor = 0;

  public constructor(urls: string[]) {
    this.endpoints = urls.map(url => ({
      url,
      connection: new Connection(url, 'confirmed'),
    }));
    if (this.endpoints.length === 0) throw new Error('At least one RPC endpoint is required');
  }

  public async healthCheck(): Promise<{ healthy: boolean; rpc?: string; slot?: number }> {
    for (let offset = 0; offset < this.endpoints.length; offset += 1) {
      const index = (this.cursor + offset) % this.endpoints.length;
      const endpoint = this.endpoints[index];
      if (!endpoint) continue;
      try {
        await endpoint.connection.getVersion();
        const slot = await endpoint.connection.getSlot('confirmed');
        this.cursor = index;
        return { healthy: true, rpc: endpoint.url, slot };
      } catch (error) {
        log('warn', 'RPC health check failed', { rpc: endpoint.url, error: String(error) });
      }
    }
    return { healthy: false };
  }

  public async run<T>(operation: (connection: Connection, rpc: string) => Promise<T>): Promise<T> {
    let lastError: unknown = new Error('No RPC endpoints available');
    for (let offset = 0; offset < this.endpoints.length; offset += 1) {
      const index = (this.cursor + offset) % this.endpoints.length;
      const endpoint = this.endpoints[index];
      if (!endpoint) continue;
      try {
        const result = await operation(endpoint.connection, endpoint.url);
        this.cursor = index;
        return result;
      } catch (error) {
        lastError = error;
        log('warn', 'RPC operation failed; trying next endpoint', { rpc: endpoint.url, error: String(error) });
      }
    }
    throw lastError;
  }
}
