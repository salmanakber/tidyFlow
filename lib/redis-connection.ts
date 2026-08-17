import type { ConnectionOptions } from 'bullmq';

/** Shared BullMQ Redis connection options for all workers/queues. */
export function getRedisConnectionOptions(): ConnectionOptions {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port, 10) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };
}
