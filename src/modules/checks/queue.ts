import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const CHECKS_QUEUE = 'checks';

export interface CheckJobData {
  monitorId: string;
  /** When the check was due; part of the job id, see checkJobId. */
  scheduledFor: string;
  manual?: boolean;
}

export type ChecksQueue = Queue<CheckJobData>;

export function createChecksQueue(redis: Redis): ChecksQueue {
  return new Queue<CheckJobData>(CHECKS_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      // A failed check is not retried: the next scheduled run is the retry.
      attempts: 1,
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
}

/**
 * Deterministic job id: BullMQ ignores a job whose id already exists,
 * so the same monitor and due time can never be queued twice.
 */
export const checkJobId = (monitorId: string, scheduledFor: Date): string =>
  `${monitorId}_${scheduledFor.getTime()}`;
