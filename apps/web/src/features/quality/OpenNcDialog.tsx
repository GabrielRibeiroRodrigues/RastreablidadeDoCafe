import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon, InfoIcon, Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EntityCombobox } from '@/components/form/EntityCombobox';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Lot } from '@/features/inventory/api';
import { LotStatusBadge } from '@/features/inventory/components';
import { getErrorMessage } from '@/lib/api';
import { nonConformitiesApi, searchLots, type NonConformityType } from './api';
import { NC_TYPES, NC_TYPE_LABELS } from './labels';

const MIN_DESCRIPTION = 3;

/** Lote mínimo para o diálogo (o detalhe do lote e a busca têm formatos diferentes). */
type LotRef = Pick<Lot, 'id' | 'code' | 'status'> & { product: { name: string } };

/**
 * Abrir não conformidade (admin e operador). Lote disponível vai para quarentena; bloqueado ou
 * consumido mantém o status (a NC só é registrada). `lot` fixa o lote (detalhe do lote).
 */
export function OpenNcDialog({ lot: fixedLot, onClose }: { lot?: LotRef; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formId = useId();
  const lotId = useId();
  const typeId = useId();
  const descriptionId = useId();
  const [picked, setPicked] = useState<Lot | null>(null);
  const [type, setType] = useState<NonConformityType | ''>('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);

  const lot: LotRef | null = fixedLot ?? picked;
  const errors = {
    lot: !lot ? 'Escolha o lote.' : null,
    type: !type ? 'Escolha o tipo.' : null,
    description:
      description.trim().length < MIN_DESCRIPTION
        ? `Descreva o problema (pelo menos ${MIN_DESCRIPTION} caracteres).`
        : null,
  };

  const open = useMutation({
    mutationFn: () => {
      if (!lot || !type) throw new Error('Preencha o formulário.');
      return nonConformitiesApi.open({ lotId: lot.id, type, description: description.trim() });
    },
    onSuccess: async (nc) => {
      toast.success(`${nc.number} aberta`, {
        description:
          nc.lot.status === 'QUARANTINE'
            ? `Lote ${nc.lot.code} em quarentena.`
            : `Lote ${nc.lot.code} mantém o status atual.`,
      });
      onClose();
      await Promise.all(
        ['non-conformities', 'lots', 'stock'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      void navigate(`/qualidade/${nc.id}`);
    },
    onError: (error) =>
      toast.error('Não foi possível abrir a não conformidade', {
        description: getErrorMessage(error),
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!errors.lot && !errors.type && !errors.description) open.mutate();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !open.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir não conformidade</DialogTitle>
          <DialogDescription>
            Um lote disponível vai para quarentena e não pode sair do local até a NC ser liberada ou
            descartada por um administrador.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="space-y-4">
          {open.isError && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{getErrorMessage(open.error)}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={touched && Boolean(errors.lot)}>
            <FieldLabel htmlFor={lotId}>
              Lote<span className="text-destructive">*</span>
            </FieldLabel>
            {fixedLot ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-mono font-medium">{fixedLot.code}</span>
                <span className="truncate text-muted-foreground">{fixedLot.product.name}</span>
                <LotStatusBadge status={fixedLot.status} className="ml-auto" />
              </div>
            ) : (
              <EntityCombobox<Lot>
                id={lotId}
                queryKey="lots"
                search={searchLots}
                value={picked}
                onChange={setPicked}
                invalid={touched && Boolean(errors.lot)}
                placeholder="Buscar pelo código (CAF-…)"
                getLabel={(item) => item.code}
                renderOption={(item) => (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-medium">{item.code}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.product.name}
                      </div>
                    </div>
                    <LotStatusBadge status={item.status} />
                  </div>
                )}
              />
            )}
            {touched && errors.lot && <FieldError errors={[{ message: errors.lot }]} />}
          </Field>
          {lot && lot.status !== 'AVAILABLE' && (
            <Alert>
              <InfoIcon />
              <AlertDescription>
                O lote não está disponível: a NC é registrada e o status atual é mantido.
              </AlertDescription>
            </Alert>
          )}
          <Field data-invalid={touched && Boolean(errors.type)}>
            <FieldLabel htmlFor={typeId}>
              Tipo<span className="text-destructive">*</span>
            </FieldLabel>
            <Select value={type} onValueChange={(value) => setType(value as NonConformityType)}>
              <SelectTrigger
                id={typeId}
                className="w-full"
                aria-invalid={touched && Boolean(errors.type)}
              >
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {NC_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {NC_TYPE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && errors.type && <FieldError errors={[{ message: errors.type }]} />}
          </Field>
          <Field data-invalid={touched && Boolean(errors.description)}>
            <FieldLabel htmlFor={descriptionId}>
              Descrição<span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id={descriptionId}
              rows={3}
              maxLength={2000}
              value={description}
              aria-invalid={touched && Boolean(errors.description)}
              placeholder="Umidade de 13,8% na reanálise (limite 12,5%)"
              onChange={(event) => setDescription(event.target.value)}
            />
            {touched && errors.description && (
              <FieldError errors={[{ message: errors.description }]} />
            )}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={open.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={open.isPending}>
            {open.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
            {open.isPending ? 'Abrindo…' : 'Abrir NC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
