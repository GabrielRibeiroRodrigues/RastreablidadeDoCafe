import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Recall = ApiSchema<'RecallResponse'>;
export type RecallDetail = ApiSchema<'RecallDetailResponse'>;
export type RecallStatus = ApiSchema<'RecallStatus'>;
export type RecallSeverity = ApiSchema<'RecallSeverity'>;
export type RecallStep = ApiSchema<'RecallStepResponse'>;
export type RecallStepName = ApiSchema<'RecallStepName'>;
export type RecallStepStatus = ApiSchema<'RecallStepStatus'>;
export type RecallSimulation = ApiSchema<'RecallSimulationResponse'>;
export type AffectedLot = ApiSchema<'AffectedLot'>;
export type UnitQuantity = ApiSchema<'UnitQuantity'>;
export type RecallInput = ApiSchema<'CreateRecallDto'>;
export type RecallsQuery = NonNullable<operations['RecallsController_list']['parameters']['query']>;

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const recallsApi = {
  list: (query: RecallsQuery, signal?: AbortSignal) =>
    unwrap(getApiClient().GET('/v1/recalls', { params: { query }, ...withSignal(signal) })),

  get: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/recalls/{id}', { params: { path: { id } }, ...withSignal(signal) }),
    ),

  /** Impacto sem gravar nada (todos os perfis). */
  simulate: (lotId: string) =>
    unwrap(getApiClient().POST('/v1/recalls/simulate', { body: { lotId } })),

  /** Cria e executa (admin). Localmente a resposta já vem concluída; na AWS, `EXECUTING`. */
  create: (body: RecallInput) => unwrap(getApiClient().POST('/v1/recalls', { body })),

  retry: (id: string) =>
    unwrap(getApiClient().POST('/v1/recalls/{id}/retry', { params: { path: { id } } })),

  /** `releaseLots`: devolve os lotes bloqueados ao status anterior ao bloqueio. */
  close: (id: string, notes: string, releaseLots = false) =>
    unwrap(
      getApiClient().POST('/v1/recalls/{id}/close', {
        params: { path: { id } },
        body: { notes, releaseLots },
      }),
    ),

  /** URL pré-assinada (curta) do PDF; 404 enquanto o relatório não existe. */
  report: (id: string) =>
    unwrap(getApiClient().GET('/v1/recalls/{id}/report', { params: { path: { id } } })),
};
