import Redis from 'ioredis';

import { env } from '../../config/env';

/**
 * One shared, lazily connected client just for the health probe.
 *
 * `retryStrategy: () => null` turns a missing Redis into an immediate "down"
 * instead of an infinite reconnect loop inside the health endpoint.
 */
let client: Redis | null = null;

export async function pingRedis(timeoutMs = 1200): Promise<boolean> {
  try {
    if (!client) {
      client = new Redis(env.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: timeoutMs,
        retryStrategy: () => null,
      });
      client.on('error', () => {
        /* surfaced through ping()'s rejection, not an unhandled event */
      });
    }
    if (client.status === 'end') await client.connect();
    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return pong === 'PONG';
  } catch {
    return false;
  }
}
