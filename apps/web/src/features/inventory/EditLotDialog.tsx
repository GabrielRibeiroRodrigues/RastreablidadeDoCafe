import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { applyApiErrors } from '@/components/form/api-form-errors';
import { FormRootError, TextField } from '@/components/form/fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/api';
import { inventoryApi, type LotDetail, type LotUpdateInput } from './api';
import { useInvalidateInventory } from './hooks';
import { QUALITY_FIELDS, qualityShape, toQualityDto, toQualityValues } from './quality';
import { QualityFields } from './QualityFields';

const schema = z.object(qualityShape);
type FormValues = z.infer<typeof schema>;

/** Corrige validade e dados de qualidade (código, produto e quantidade não mudam). */
export function EditLotDialog({ lot, onClose }: { lot: LotDetail; onClose: () => void }) {
  const formId = useId();
  const invalidate = useInvalidateInventory();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toQualityValues(lot),
  });

  const save = useMutation({
    mutationFn: (body: LotUpdateInput) => inventoryApi.updateLot(lot.id, body),
    onSuccess: async () => {
      toast.success(`Lote ${lot.code} atualizado`);
      onClose();
      await invalidate();
    },
    onError: (error) =>
      toast.error('Não foi possível salvar o lote', { description: getErrorMessage(error) }),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(toQualityDto(values));
    } catch (error) {
      applyApiErrors(form.setError, error, QUALITY_FIELDS);
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar dados de {lot.code}</DialogTitle>
          <DialogDescription>
            Validade e qualidade. Código, produto e quantidades não mudam.
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="-mx-4 max-h-[65vh] space-y-4 overflow-y-auto px-4 py-1"
        >
          <FormRootError errors={form.formState.errors} />
          <TextField
            control={form.control}
            name="expiresAt"
            label="Validade"
            type="date"
            className="sm:max-w-56"
          />
          <QualityFields control={form.control} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
