import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Lot = ApiSchema<'LotResponse'>;
export type LotDetail = ApiSchema<'LotDetailResponse'>;
export type LotStatus = ApiSchema<'LotStatus'>;
export type SettableLotStatus = ApiSchema<'SettableLotStatus'>;
export type Movement = ApiSchema<'MovementResponse'>;
export type MovementType = ApiSchema<'MovementType'>;
export type ManualMovementType = ApiSchema<'ManualMovementType'>;
export type StockRow = ApiSchema<'StockRow'>;
export type ReceiptInput = ApiSchema<'CreateReceiptDto'>;
export type MovementInput = ApiSchema<'CreateMovementDto'>;
export type LotUpdateInput = ApiSchema<'UpdateLotDto'>;
export type Attachment = ApiSchema<'AttachmentResponse'>;
export type AttachmentContentType = ApiSchema<'CreateAttachmentDto'>['contentType'];

export type LotsQuery = NonNullable<operations['LotsController_list']['parameters']['query']>;
export type MovementsQuery = NonNullable<
  operations['MovementsController_list']['parameters']['query']
>;
export type StockQuery = NonNullable<operations['StockController_position']['parameters']['query']>;

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** Raízes das query keys: qualquer movimentação invalida as três. */
export const INVENTORY_KEYS = ['lots', 'movements', 'stock'] as const;

export const inventoryApi = {
  listLots: (query: LotsQuery, signal?: AbortSignal) =>
    unwrap(getApiClient().GET('/v1/lots', { params: { query }, ...withSignal(signal) })),

  getLot: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/lots/{id}', { params: { path: { id } }, ...withSignal(signal) }),
    ),

  updateLot: (id: string, body: LotUpdateInput) =>
    unwrap(getApiClient().PATCH('/v1/lots/{id}', { params: { path: { id } }, body })),

  changeStatus: (id: string, status: SettableLotStatus, reason: string) =>
    unwrap(
      getApiClient().PATCH('/v1/lots/{id}/status', {
        params: { path: { id } },
        body: { status, reason },
      }),
    ),

  /** `idempotencyKey`: a mesma chave em retentativas do mesmo envio (ver `useIdempotencyKey`). */
  receive: (body: ReceiptInput, idempotencyKey: string) =>
    unwrap(
      getApiClient().POST('/v1/receipts', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    ),

  listMovements: (query: MovementsQuery, signal?: AbortSignal) =>
    unwrap(getApiClient().GET('/v1/movements', { params: { query }, ...withSignal(signal) })),

  move: (body: MovementInput, idempotencyKey: string) =>
    unwrap(
      getApiClient().POST('/v1/movements', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    ),

  reverse: (id: string, reason: string) =>
    unwrap(
      getApiClient().POST('/v1/movements/{id}/reverse', {
        params: { path: { id } },
        body: { reason },
      }),
    ),

  stock: (query: StockQuery, signal?: AbortSignal) =>
    unwrap(getApiClient().GET('/v1/stock', { params: { query }, ...withSignal(signal) })),

  listAttachments: (lotId: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/lots/{lotId}/attachments', {
        params: { path: { lotId } },
        ...withSignal(signal),
      }),
    ),

  /**
   * Upload direto para o bucket: registra o anexo, envia o arquivo pelo formulário pré-assinado
   * (campos primeiro, arquivo por último) e confirma na API.
   */
  uploadAttachment: async (lotId: string, file: File, contentType: AttachmentContentType) => {
    const client = getApiClient();
    const { attachment, upload } = await unwrap(
      client.POST('/v1/lots/{lotId}/attachments', {
        params: { path: { lotId } },
        body: { fileName: file.name, contentType, sizeBytes: file.size },
      }),
    );

    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
    form.append('file', file);
    let response: Response;
    try {
      response = await fetch(upload.url, { method: 'POST', body: form });
    } catch {
      throw new Error('Não foi possível enviar o arquivo ao armazenamento.');
    }
    if (!response.ok) {
      throw new Error(`O armazenamento recusou o arquivo (HTTP ${response.status}).`);
    }

    return unwrap(
      client.POST('/v1/lots/{lotId}/attachments/{id}/confirm', {
        params: { path: { lotId, id: attachment.id } },
      }),
    );
  },

  /** Gera (ou regenera) o PDF da etiqueta; o link público do QR code não muda entre gerações. */
  generateLabel: (lotId: string) =>
    unwrap(getApiClient().POST('/v1/lots/{id}/label', { params: { path: { id: lotId } } })),

  /** Um PDF com as etiquetas de vários lotes (uma por página, até 50). */
  generateLabelsBatch: (lotIds: string[]) =>
    unwrap(getApiClient().POST('/v1/labels/batch', { body: { lotIds } })),

  /** Retira um anexo enviado por engano (admin; o registro fica na auditoria). */
  removeAttachment: (lotId: string, id: string, reason: string) =>
    unwrap(
      getApiClient().POST('/v1/lots/{lotId}/attachments/{id}/remove', {
        params: { path: { lotId, id } },
        body: { reason },
      }),
    ),

  downloadAttachment: (lotId: string, id: string) =>
    unwrap(
      getApiClient().GET('/v1/lots/{lotId}/attachments/{id}/download', {
        params: { path: { lotId, id } },
      }),
    ),
};
