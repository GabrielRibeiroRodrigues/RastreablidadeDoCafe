import { useMutation } from '@tanstack/react-query';
import type { ApiSchema } from '@traceflow/shared';
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileDownIcon,
  Loader2Icon,
  TagIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { inventoryApi, type LotDetail } from './api';

type Label = ApiSchema<'LabelResponse'>;

/**
 * Botão "Etiqueta": gera o PDF (100 × 150 mm, com QR code), abre numa nova aba e mostra o link
 * público de rastreio com botão de copiar.
 */
export function LabelButton({ lot }: { lot: LotDetail }) {
  const [label, setLabel] = useState<Label | null>(null);
  const [open, setOpen] = useState(false);

  const generate = useMutation({
    mutationFn: async (tab: Window | null) => {
      try {
        return { label: await inventoryApi.generateLabel(lot.id), tab };
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
    onSuccess: ({ label: next, tab }) => {
      setLabel(next);
      // A aba foi aberta no clique (senão o bloqueador de pop-ups a recusaria após o await).
      if (tab) tab.location.href = next.url;
      setOpen(true);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const start = () => {
    const tab = window.open('', '_blank');
    // A aba nova não precisa (nem deve) controlar a aplicação.
    if (tab) tab.opener = null;
    generate.mutate(tab);
  };

  return (
    <>
      <Button variant="outline" onClick={start} disabled={generate.isPending}>
        {generate.isPending ? <Loader2Icon className="animate-spin" /> : <TagIcon />}
        Etiqueta
      </Button>
      {label && <LabelDialog lotCode={lot.code} label={label} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function LabelDialog({
  lotCode,
  label,
  open,
  onOpenChange,
}: {
  lotCode: string;
  label: Label;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(label.publicUrl);
      setCopied(true);
      setCopyFailed(false);
      toast.success('Link copiado.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etiqueta do lote {lotCode}</DialogTitle>
          <DialogDescription>
            PDF 100 × 150 mm com QR code. O link público é o mesmo em todas as etiquetas deste lote
            e mostra apenas a origem — sem dados internos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Página pública de rastreio</p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={label.publicUrl}
              aria-label="Link público de rastreio"
              className="font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => void copy()} aria-label="Copiar link">
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          {copyFailed && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>
                Não foi possível copiar automaticamente. Selecione o link e copie manualmente.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" asChild>
            <a href={label.publicUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
              Ver página pública
            </a>
          </Button>
          <Button asChild>
            <a href={label.url} target="_blank" rel="noreferrer">
              <FileDownIcon />
              Abrir PDF
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
