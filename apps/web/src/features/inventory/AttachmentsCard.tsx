import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DownloadIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  UploadIcon,
} from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/quantity';
import { inventoryApi, type AttachmentContentType } from './api';

const ACCEPTED: Record<string, AttachmentContentType> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
const MAX_BYTES = 10 * 1024 * 1024;

const sizeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / 1024 / 1024)} MB`;
}

function attachmentError(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return 'O armazenamento de anexos não está configurado na API.';
  }
  return getErrorMessage(error);
}

/** Laudos, notas fiscais e fotos do lote: upload direto para o bucket (formulário pré-assinado). */
export function AttachmentsCard({ lotId, canUpload }: { lotId: string; canUpload: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryKey = ['lots', 'attachments', lotId];

  const list = useQuery({
    queryKey,
    queryFn: ({ signal }) => inventoryApi.listAttachments(lotId, signal),
  });

  const upload = useMutation({
    mutationFn: ({ file, type }: { file: File; type: AttachmentContentType }) =>
      inventoryApi.uploadAttachment(lotId, file, type),
    onSuccess: async (attachment) => {
      toast.success('Anexo enviado', { description: attachment.fileName });
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast.error('Não foi possível enviar o anexo', { description: attachmentError(error) }),
  });

  const download = useMutation({
    mutationFn: (id: string) => inventoryApi.downloadAttachment(lotId, id),
    onError: (error) =>
      toast.error('Não foi possível baixar o anexo', { description: attachmentError(error) }),
  });

  const onDownload = async (id: string) => {
    // A aba é aberta já no clique (senão o bloqueador de pop-ups a barra após o await).
    const tab = window.open('', '_blank');
    try {
      const { url } = await download.mutateAsync(id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const type = ACCEPTED[file.type];
    if (!type) {
      toast.error('Tipo de arquivo não aceito', { description: 'Envie PDF, JPEG, PNG ou WebP.' });
      return;
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      toast.error('Arquivo muito grande', { description: 'O limite é 10 MB.' });
      return;
    }
    upload.mutate({ file, type });
  };

  const items = list.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PaperclipIcon className="size-4" aria-hidden />
          Anexos
        </CardTitle>
        <CardDescription>Laudos de classificação, notas fiscais e fotos.</CardDescription>
        {canUpload && (
          <CardAction>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              aria-label="Arquivo para anexar"
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <UploadIcon />
              )}
              Anexar
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {list.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : list.isError ? (
          <p className="text-sm text-destructive">{attachmentError(list.error)}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
        ) : (
          <ul className="divide-y">
            {items.map((attachment) => {
              const Icon = attachment.contentType.startsWith('image/') ? ImageIcon : FileIcon;
              return (
                <li key={attachment.id} className="flex items-center gap-3 py-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{attachment.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatSize(attachment.sizeBytes)} ·{' '}
                      {formatDateTime(attachment.uploadedAt ?? attachment.createdAt)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Baixar ${attachment.fileName}`}
                    title="Baixar"
                    onClick={() => void onDownload(attachment.id)}
                  >
                    <DownloadIcon />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
