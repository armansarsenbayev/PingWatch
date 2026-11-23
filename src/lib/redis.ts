import { Redis } from 'ioredis';

export function createRedis(redisUrl: string): Redis {
  // maxRetriesPerRequest: null is required by BullMQ workers later on.
  return new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
}
