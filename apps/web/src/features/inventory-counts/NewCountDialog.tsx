import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon, Loader2Icon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocations } from '@/features/inventory/hooks';
import { getErrorMessage } from '@/lib/api';
import { inventoryCountsApi } from './api';

/** Abrir contagem (admin e operador): o sistema lista os lotes com saldo no local escolhido. */
export function NewCountDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formId = useId();
  const locationId = useId();
  const notesId = useId();
  const locations = useLocations();
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const missingLocation = !location;

  const create = useMutation({
    mutationFn: () =>
      inventoryCountsApi.create({
        locationId: location,
        ...(notes.trim() && { notes: notes.trim() }),
      }),
    onSuccess: async (count) => {
      toast.success(`${count.number} aberta`, {
        description:
          count.itemsCount === 1 ? '1 lote para contar.' : `${count.itemsCount} lotes para contar.`,
      });
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      void navigate(`/inventario/${count.id}`);
    },
    onError: (error) =>
      toast.error('Não foi possível abrir a contagem', { description: getErrorMessage(error) }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!missingLocation) create.mutate();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !create.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova contagem de inventário</DialogTitle>
          <DialogDescription>
            A lista começa com os lotes que têm saldo no local. O estoque continua livre durante a
            contagem: a diferença é calculada com o saldo do momento em que ela for aplicada.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="space-y-4">
          {create.isError && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{getErrorMessage(create.error)}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={touched && missingLocation}>
            <FieldLabel htmlFor={locationId}>
              Local<span className="text-destructive">*</span>
            </FieldLabel>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger
                id={locationId}
                className="w-full"
                aria-invalid={touched && missingLocation}
              >
                <SelectValue placeholder={locations.isPending ? 'Carregando…' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                {locations.data?.data.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="font-mono text-xs">{item.code}</span> {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && missingLocation && (
              <FieldError errors={[{ message: 'Escolha o local.' }]} />
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={notesId}>Observações</FieldLabel>
            <Textarea
              id={notesId}
              rows={2}
              maxLength={500}
              value={notes}
              placeholder="Contagem mensal do armazém"
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={create.isPending}>
            {create.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
            {create.isPending ? 'Abrindo…' : 'Abrir contagem'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
