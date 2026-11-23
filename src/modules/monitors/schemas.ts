import { z } from 'zod';

// Field rules without defaults: PATCH reuses them, and a default there would
// silently overwrite fields the client did not send.
const fields = {
  name: z.string().trim().min(1).max(100),
  url: z.url({ protocol: /^https?$/ }).max(2048),
  method: z.enum(['GET', 'HEAD']),
  intervalSec: z.number().int().min(30).max(3600),
  timeoutMs: z.number().int().min(1000).max(30_000),
  expectedStatus: z.number().int().min(100).max(599),
  keyword: z.string().min(1).max(200).nullable(),
};

export const createMonitorSchema = z.object({
  name: fields.name,
  url: fields.url,
  method: fields.method.default('GET'),
  intervalSec: fields.intervalSec.default(60),
  timeoutMs: fields.timeoutMs.default(10_000),
  expectedStatus: fields.expectedStatus.default(200),
  keyword: fields.keyword.default(null),
});

export const updateMonitorSchema = z
  .object(fields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'send at least one field to update');

export const monitorParamsSchema = z.object({ id: z.uuid() });

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const monitorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  url: z.string(),
  method: z.enum(['GET', 'HEAD']),
  intervalSec: z.number(),
  timeoutMs: z.number(),
  expectedStatus: z.number(),
  keyword: z.string().nullable(),
  isPaused: z.boolean(),
  lastStatus: z.enum(['unknown', 'up', 'down']),
  nextCheckAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const monitorListSchema = z.object({
  items: z.array(monitorSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
export type MonitorResponse = z.infer<typeof monitorSchema>;
