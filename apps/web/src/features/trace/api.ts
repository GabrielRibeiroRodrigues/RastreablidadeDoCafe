import type { ApiSchema } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type TraceNode = ApiSchema<'TraceNode'>;
export type TraceEdge = ApiSchema<'TraceEdge'>;
export type TraceSupplier = ApiSchema<'TraceSupplier'>;
export type TraceShipment = ApiSchema<'TraceShipment'>;
export type TraceCustomer = ApiSchema<'TraceCustomer'>;
export type BackwardTrace = ApiSchema<'BackwardTraceResponse'>;
export type ForwardTrace = ApiSchema<'ForwardTraceResponse'>;

export type TraceDirection = 'backward' | 'forward';

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const traceApi = {
  backward: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/lots/{id}/trace/backward', {
        params: { path: { id } },
        ...withSignal(signal),
      }),
    ),

  forward: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/lots/{id}/trace/forward', {
        params: { path: { id } },
        ...withSignal(signal),
      }),
    ),
};
