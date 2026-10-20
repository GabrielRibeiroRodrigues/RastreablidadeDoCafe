import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  Loader2Icon,
  PackageSearchIcon,
  PlusIcon,
  XCircleIcon,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { useInventoryPermissions } from '@/auth/permissions';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { DetailPageError, DetailPageSkeleton } from '@/components/layout/DetailStates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';
import type { Lot } from '@/features/inventory/api';
import { LotStatusBadge, Quantity } from '@/features/inventory/components';
import { useInvalidateInventory } from '@/features/inventory/hooks';
import { ReasonDialog } from '@/features/inventory/ReasonDialogs';
import { searchLots } from '@/features/quality/api';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime, formatQuantity, parseCountInput, toMilli } from '@/lib/quantity';
import { inventoryCountsApi, type InventoryCountDetail, type InventoryCountItem } from './api';
import { CountStatusBadge, Difference } from './components';

const detailKey = (id: string) => ['inventory-counts', 'detail', id];

/**
 * Campo da quantidade contada: salva ao sair do campo (ou Enter) se mudou e é válido. O pai usa a
 * quantidade salva como `key`, então o texto reinicia quando o servidor devolve outro valor.
 */
function CountedInput({
  item,
  disabled,
  onSave,
}: {
  item: InventoryCountItem;
  disabled: boolean;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(
    item.countedQuantity === null ? '' : formatQuantity(item.countedQuantity).replace(/\./g, ''),
  );
  const [saving, setSaving] = useState(false);

  const parsed = text.trim() ? parseCountInput(text) : null;
  const invalid = text.trim() !== '' && parsed === null;
  const save = async () => {
    if (!parsed) return;
    if (item.countedQuantity !== null && toMilli(parsed) === toMilli(item.countedQuantity)) return;
    setSaving(true);
    try {
      await onSave(parsed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5 md:justify-start">
      <Input
        inputMode="decimal"
        aria-label={`Quantidade contada de ${item.lot.code}`}
        aria-invalid={invalid}
        className="h-8 w-28 text-right tabular-nums"
        value={text}
        placeholder="—"
        disabled={disabled || saving}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }
        }}
      />
      {saving && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden />}
    </div>
  );
}

/** Inclui um lote achado no local que não estava na lista. */
function AddLotDialog({
  count,
  onClose,
  onAdded,
}: {
  count: InventoryCountDetail;
  onClose: () => void;
  onAdded: (count: InventoryCountDetail) => void;
}) {
  const formId = useId();
  const lotId = useId();
  const quantityId = useId();
  const [lot, setLot] = useState<Lot | null>(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const quantity = parseCountInput(text);
  const listed = new Set(count.items.map((item) => item.lot.id));
  const errors = {
    lot: !lot ? 'Escolha o lote.' : listed.has(lot.id) ? 'Este lote já está na contagem.' : null,
    quantity: quantity === null ? 'Informe a quantidade contada (0 ou mais, até 3 casas).' : null,
  };

  const add = useMutation({
    mutationFn: () => inventoryCountsApi.addItem(count.id, lot?.id ?? '', quantity ?? ''),
    onSuccess: (next) => {
      toast.success(`Lote ${lot?.code ?? ''} incluído na contagem`);
      onAdded(next);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!errors.lot && !errors.quantity) add.mutate();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !add.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Incluir lote encontrado</DialogTitle>
          <DialogDescription>
            Para um lote que está fisicamente em {count.location.code} mas não apareceu na lista (o
            sistema não tem saldo dele aqui). A sobra vira ajuste de entrada ao aplicar.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="space-y-4">
          {add.isError && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{getErrorMessage(add.error)}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={touched && Boolean(errors.lot)}>
            <FieldLabel htmlFor={lotId}>
              Lote<span className="text-destructive">*</span>
            </FieldLabel>
            <EntityCombobox<Lot>
              id={lotId}
              queryKey="lots"
              search={searchLots}
              value={lot}
              onChange={setLot}
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
            {touched && errors.lot && <FieldError errors={[{ message: errors.lot }]} />}
          </Field>
          <Field data-invalid={touched && Boolean(errors.quantity)}>
            <FieldLabel htmlFor={quantityId}>
              Quantidade contada<span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id={quantityId}
              inputMode="decimal"
              value={text}
              placeholder="0,000"
              aria-invalid={touched && Boolean(errors.quantity)}
              onChange={(event) => setText(event.target.value)}
            />
            {touched && errors.quantity && <FieldError errors={[{ message: errors.quantity }]} />}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={add.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={add.isPending}>
            {add.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
            Incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmação da aplicação, com o resumo dos ajustes que serão lançados. */
function ApplyDialog({
  count,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  count: InventoryCountDetail;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const changed = count.items.filter((item) => item.difference && toMilli(item.difference) !== 0n);
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar {count.number}?</DialogTitle>
          <DialogDescription>
            Cada diferença vira um ajuste no estoque de {count.location.code}, com documento{' '}
            {count.number}. A diferença é recalculada agora com o saldo atual. Depois de aplicada, a
            contagem não pode ser alterada (correções por estorno do ajuste).
          </DialogDescription>
        </DialogHeader>
        {Boolean(error) && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        )}
        <Alert>
          <InfoIcon />
          <AlertTitle>
            {changed.length === 0
              ? 'Sem diferenças: nenhum ajuste será lançado'
              : changed.length === 1
                ? '1 ajuste será lançado'
                : `${changed.length} ajustes serão lançados`}
          </AlertTitle>
          {changed.length > 0 && (
            <AlertDescription>
              <ul className="mt-1 space-y-0.5">
                {changed.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex gap-2">
                    <span className="font-mono text-xs">{item.lot.code}</span>
                    <Difference value={item.difference} unit={item.unit} />
                  </li>
                ))}
                {changed.length > 8 && <li>e mais {changed.length - 8}…</li>}
              </ul>
            </AlertDescription>
          )}
        </Alert>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Voltar
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            Aplicar contagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InventoryCountDetailPage() {
  const { id = '' } = useParams();
  const { canOperate, canAdjust } = useInventoryPermissions();
  const queryClient = useQueryClient();
  const invalidateInventory = useInvalidateInventory();
  const [dialog, setDialog] = useState<'add' | 'apply' | 'cancel' | null>(null);

  const query = useQuery({
    queryKey: detailKey(id),
    queryFn: ({ signal }) => inventoryCountsApi.get(id, signal),
  });

  const store = (count: InventoryCountDetail) => {
    queryClient.setQueryData(detailKey(id), count);
    void queryClient.invalidateQueries({ queryKey: ['inventory-counts', 'list'] });
  };

  const saveCount = (itemId: string, value: string) =>
    inventoryCountsApi.count(id, itemId, value).then(store, (error: unknown) => {
      toast.error('Não foi possível salvar a contagem', { description: getErrorMessage(error) });
    });

  const apply = useMutation({
    mutationFn: () => inventoryCountsApi.apply(id),
    onSuccess: async (count) => {
      const adjusted = count.items.filter((item) => item.adjustmentId).length;
      toast.success(`${count.number} aplicada`, {
        description:
          adjusted === 0
            ? 'Estoque conferido sem diferenças.'
            : adjusted === 1
              ? '1 ajuste lançado no estoque.'
              : `${adjusted} ajustes lançados no estoque.`,
      });
      store(count);
      setDialog(null);
      await invalidateInventory();
    },
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => inventoryCountsApi.cancel(id, reason),
    onSuccess: (count) => {
      toast.success(`${count.number} cancelada`);
      store(count);
      setDialog(null);
    },
  });

  const crumbs = [
    { label: 'Inventário', to: '/inventario' },
    { label: query.data?.number ?? 'Contagem' },
  ];

  if (query.isPending) return <DetailPageSkeleton breadcrumbs={crumbs} cards={1} />;
  if (query.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={query.error}
        onRetry={() => void query.refetch()}
        entity="Contagem"
        backTo="/inventario"
        backLabel="Ver contagens"
      />
    );
  }

  const count = query.data;
  const isOpen = count.status === 'OPEN';
  const canCount = isOpen && canOperate;
  const missing = count.itemsCount - count.countedCount;

  const columns: Column<InventoryCountItem>[] = [
    {
      id: 'lot',
      header: 'Lote',
      cell: (item) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
          <Link
            to={`/lotes/${item.lot.id}`}
            className="font-mono text-xs underline-offset-4 hover:underline"
          >
            {item.lot.code}
          </Link>
          {item.lot.status !== 'AVAILABLE' && <LotStatusBadge status={item.lot.status} />}
        </span>
      ),
    },
    {
      id: 'product',
      header: 'Produto',
      className: 'whitespace-normal',
      cell: (item) => <span className="line-clamp-2 min-w-32">{item.product.name}</span>,
    },
    {
      id: 'system',
      header: isOpen ? 'Saldo atual' : 'Saldo na aplicação',
      cell: (item) => (
        <span className="tabular-nums">
          <Quantity value={item.currentQuantity} unit={item.unit} />
          {isOpen && item.currentQuantity !== item.systemQuantity && (
            <span className="block text-xs text-muted-foreground">
              na abertura: {formatQuantity(item.systemQuantity, item.unit)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'counted',
      header: 'Contado',
      cell: (item) =>
        canCount ? (
          <CountedInput
            key={item.countedQuantity ?? 'empty'}
            item={item}
            disabled={apply.isPending}
            onSave={(value) => saveCount(item.id, value)}
          />
        ) : item.countedQuantity === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">
            <Quantity value={item.countedQuantity} unit={item.unit} />
          </span>
        ),
    },
    {
      id: 'difference',
      header: 'Diferença',
      cell: (item) => <Difference value={item.difference} unit={item.unit} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        mono
        title={count.number}
        documentTitle={`Inventário ${count.number}`}
        breadcrumbs={crumbs}
        badges={<CountStatusBadge status={count.status} className="h-6 px-2.5 text-sm" />}
        description={
          <>
            <span className="font-mono">{count.location.code}</span> {count.location.name} · aberta
            em {formatDateTime(count.createdAt)} por{' '}
            <span className="font-medium text-foreground">{count.createdBy.name}</span>
          </>
        }
        actions={
          isOpen && (
            <>
              {canOperate && (
                <Button variant="outline" onClick={() => setDialog('add')}>
                  <PlusIcon />
                  Incluir lote
                </Button>
              )}
              {canAdjust && (
                <>
                  <Button variant="outline" onClick={() => setDialog('cancel')}>
                    <XCircleIcon />
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => setDialog('apply')}
                    disabled={missing > 0}
                    title={missing > 0 ? 'Conte todos os lotes antes de aplicar' : undefined}
                  >
                    <CheckCircle2Icon />
                    Aplicar
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      {isOpen && (
        <Alert>
          <InfoIcon />
          <AlertTitle>
            {missing === 0
              ? 'Todos os lotes foram contados'
              : `${count.countedCount} de ${count.itemsCount} lotes contados`}
          </AlertTitle>
          <AlertDescription>
            {canOperate
              ? 'Digite a quantidade encontrada de cada lote (0 se não achou nada); salva ao sair do campo. '
              : ''}
            {canAdjust
              ? 'Ao aplicar, as diferenças viram ajustes no estoque.'
              : 'Um administrador aplica a contagem quando todos os lotes estiverem contados.'}
          </AlertDescription>
        </Alert>
      )}
      {count.status === 'APPLIED' && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>
            Aplicada em {formatDateTime(count.appliedAt)} por {count.appliedBy?.name ?? '—'}
          </AlertTitle>
          <AlertDescription>
            <Link
              to={`/movimentacoes?type=ADJUSTMENT&locationId=${count.location.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              Ver os ajustes nas movimentações
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {count.status === 'CANCELLED' && (
        <Alert>
          <XCircleIcon />
          <AlertTitle>
            Cancelada em {formatDateTime(count.cancelledAt)} por {count.cancelledBy?.name ?? '—'}
          </AlertTitle>
          <AlertDescription>{count.cancelReason}</AlertDescription>
        </Alert>
      )}
      {count.notes && (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{count.notes}</p>
      )}

      <DataTable
        caption={`Lotes da contagem ${count.number}`}
        columns={columns}
        rows={count.items}
        isLoading={false}
        error={null}
        onRetry={() => undefined}
        sort=""
        onSortChange={() => undefined}
        empty={
          <EmptyState
            icon={PackageSearchIcon}
            title="Nenhum lote com saldo neste local"
            description="Se encontrou café aqui, inclua o lote para registrar a sobra."
          />
        }
      />

      {dialog === 'add' && (
        <AddLotDialog
          count={count}
          onClose={() => setDialog(null)}
          onAdded={(next) => {
            store(next);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'apply' && (
        <ApplyDialog
          count={count}
          pending={apply.isPending}
          error={apply.error}
          onConfirm={() => apply.mutate()}
          onClose={() => {
            apply.reset();
            setDialog(null);
          }}
        />
      )}
      {dialog === 'cancel' && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={`Cancelar ${count.number}?`}
          description="Nada é lançado no estoque e o local fica livre para uma nova contagem."
          confirmLabel="Cancelar contagem"
          dismissLabel="Voltar"
          destructive
          minLength={5}
          pending={cancel.isPending}
          error={cancel.error}
          onSubmit={(reason) => cancel.mutate(reason)}
          reasonPlaceholder="Contagem aberta no local errado"
        />
      )}
    </div>
  );
}
