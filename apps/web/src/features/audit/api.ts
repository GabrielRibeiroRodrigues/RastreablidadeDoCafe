import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type AuditLog = ApiSchema<'AuditLogResponse'>;
export type AuditLogsQuery = NonNullable<
  operations['AuditLogsController_list']['parameters']['query']
>;

export const auditApi = {
  list: (query: AuditLogsQuery, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/audit-logs', { params: { query }, ...(signal ? { signal } : {}) }),
    ),
};
