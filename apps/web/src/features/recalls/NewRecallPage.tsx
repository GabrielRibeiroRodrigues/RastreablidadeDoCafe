import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlertIcon,
  InfoIcon,
  Loader2Icon,
  ScanSearchIcon,
  SirenIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { cn } from 'cn';
import { useQualityPermissions } from '@/auth/permissions';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { inventoryApi, type Lot } from '@/features/inventory/api';
import { LotStatusBadge } from '@/features/inventory/components';
import { isUuid } from '@/features/inventory/url-filters';
import { searchLots } from '@/features/quality/api';
import { getErrorMessage } from '@/lib/api';
import { recallsApi, type RecallSeverity, type RecallSimulation } from './api';
import { UnitQuantities } from './components';
import { ImpactView } from './ImpactView';
import { RECALL_SEVERITY_HINTS, RECALL_SEVERITY_LABELS } from './labels';
import { countOf, plural } from '@/lib/plural';

const CRUMBS = [
  { label: 'Qualidade' },
  { label: 'Recall', to: '/recall' },
  { label: 'Novo recall' },
];
const MIN_REASON = 5;
const SEVERITIES: RecallSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];

/** Confirmação forte: digitar o código do lote de origem libera o botão. */
function ExecuteDialog({
  lot,
  impact,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  lot: Lot;
  impact: RecallSimulation;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toUpperCase() === lot.code.toUpperCase();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SirenIcon className="size-5 text-destructive" aria-hidden />
            Executar recall de {lot.code}?
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita: os lotes ficam bloqueados até serem liberados um a um
            por um administrador, mesmo depois de encerrado o recall.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
          <li>
            <strong className="font-medium">{impact.totals.lots}</strong>{' '}
            {plural(impact.totals.lots, 'lote será bloqueado', 'lotes serão bloqueados')}
            (saldo: <UnitQuantities items={impact.totals.stock} />)
          </li>
          <li>
            <strong className="font-medium">{impact.totals.customers}</strong>{' '}
            {plural(impact.totals.customers, 'cliente', 'clientes')} a contatar (
            {countOf(impact.totals.shipments, 'expedição', 'expedições')})
          </li>
          <li>Relatório PDF e aviso à equipe serão gerados.</li>
        </ul>
        {error !== null && error !== undefined && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor={inputId}>
            Para confirmar, digite o código do lote:{' '}
            <span className="font-mono font-semibold select-all">{lot.code}</span>
          </FieldLabel>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            placeholder={lot.code}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches && !pending) onConfirm();
            }}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!matches || pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            Executar recall
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewRecallPage() {
  const { canCreateRecall } = useQualityPermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const lotParam = search.get('lotId');
  const lotFieldId = useId();
  const reasonId = useId();

  const [pickedLot, setPickedLot] = useState<Lot | null>(null);
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState<RecallSeverity>('HIGH');
  const [touched, setTouched] = useState(false);
  const [simulation, setSimulation] = useState<{
    lotId: string;
    data: RecallSimulation;
    at: Date;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Lote vindo da URL (`/recall/novo?lotId=…`, a partir do detalhe do lote).
  const initialLot = useQuery({
    queryKey: ['lots', 'detail', lotParam],
    queryFn: ({ signal }) => inventoryApi.getLot(lotParam ?? '', signal),
    enabled: Boolean(lotParam && isUuid(lotParam)) && pickedLot === null,
  });
  const lot = pickedLot ?? initialLot.data ?? null;

  const simulate = useMutation({
    mutationFn: (lotId: string) => recallsApi.simulate(lotId),
    onSuccess: (data, lotId) => setSimulation({ lotId, data, at: new Date() }),
    onError: (error) =>
      toast.error('Não foi possível simular', { description: getErrorMessage(error) }),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!lot) throw new Error('Escolha o lote de origem.');
      return recallsApi.create({ lotId: lot.id, reason: reason.trim(), severity });
    },
    onSuccess: async (recall) => {
      toast.success(`Recall ${recall.number} executado`, {
        description:
          recall.status === 'FAILED'
            ? 'Uma etapa falhou: veja o detalhe e tente de novo.'
            : `${countOf(recall.lotsCount, 'lote bloqueado', 'lotes bloqueados')}, ${countOf(recall.customersCount, 'cliente', 'clientes')} a contatar.`,
      });
      await Promise.all(
        ['recalls', 'lots', 'stock', 'movements'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      void navigate(`/recall/${recall.id}`);
    },
  });

  const impact = simulation && lot && simulation.lotId === lot.id ? simulation.data : null;
  const reasonInvalid = touched && reason.trim().length < MIN_REASON;

  const onSimulate = (event: FormEvent) => {
    event.preventDefault();
    if (lot) simulate.mutate(lot.id);
  };

  const onExecute = () => {
    setTouched(true);
    if (reason.trim().length < MIN_REASON) {
      document.getElementById(reasonId)?.focus();
      return;
    }
    create.reset();
    setConfirming(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={canCreateRecall ? 'Novo recall' : 'Simular recall'}
        breadcrumbs={
          canCreateRecall ? CRUMBS : [...CRUMBS.slice(0, 2), { label: 'Simular recall' }]
        }
        description="Escolha o lote com problema e simule o impacto antes de executar: lotes derivados, saldo em estoque e clientes que receberam o produto."
      />

      {!canCreateRecall && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Seu perfil pode simular o impacto, mas só administradores executam um recall.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Lote de origem</CardTitle>
          <CardDescription>
            O lote onde o problema foi encontrado (ex.: café verde com laudo reprovado). Os lotes
            &quot;irmãos&quot; de um blend não entram, só o que foi feito com este lote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSimulate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="sm:max-w-sm">
              <FieldLabel htmlFor={lotFieldId}>Lote</FieldLabel>
              <EntityCombobox<Lot>
                id={lotFieldId}
                queryKey="lots"
                search={searchLots}
                value={lot}
                onChange={(next) => setPickedLot(next)}
                placeholder={
                  lotParam && initialLot.isPending && !pickedLot
                    ? 'Carregando lote…'
                    : 'Buscar pelo código (CAF-…)'
                }
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
            </Field>
            <Button type="submit" disabled={!lot || simulate.isPending}>
              {simulate.isPending ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <ScanSearchIcon />
              )}
              {impact ? 'Simular de novo' : 'Simular impacto'}
            </Button>
          </form>
          {lot && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{lot.product.name}</span>
              {lot.supplier && <> · {lot.supplier.farmName ?? lot.supplier.name}</>} · status{' '}
              <LotStatusBadge status={lot.status} />
            </p>
          )}
        </CardContent>
      </Card>

      {simulate.isError && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{getErrorMessage(simulate.error)}</AlertDescription>
        </Alert>
      )}

      {impact && simulation && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">2. Impacto</h2>
            <ImpactView impact={impact} simulatedAt={simulation.at} />
          </section>

          {canCreateRecall && lot && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle>3. Executar</CardTitle>
                <CardDescription>
                  Registra o recall, bloqueia {plural(impact.totals.lots, 'o', 'os')}{' '}
                  {countOf(impact.totals.lots, 'lote', 'lotes')}, gera o relatório e avisa a equipe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Field data-invalid={reasonInvalid}>
                  <FieldLabel htmlFor={reasonId}>
                    Motivo<span className="text-destructive">*</span>
                  </FieldLabel>
                  <Textarea
                    id={reasonId}
                    rows={3}
                    maxLength={2000}
                    value={reason}
                    aria-invalid={reasonInvalid}
                    placeholder="Ocratoxina acima do limite no laudo do lote verde"
                    onChange={(event) => setReason(event.target.value)}
                    onBlur={() => setTouched(true)}
                  />
                  {reasonInvalid ? (
                    <FieldError
                      errors={[
                        { message: `Descreva o motivo (pelo menos ${MIN_REASON} caracteres).` },
                      ]}
                    />
                  ) : (
                    <FieldDescription>Vai para o relatório e para o aviso.</FieldDescription>
                  )}
                </Field>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Severidade</legend>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                    {SEVERITIES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={severity === option}
                        onClick={() => setSeverity(option)}
                        className={cn(
                          'rounded-lg border p-3 text-left text-sm transition-colors',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          severity === option
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'hover:bg-muted/60',
                        )}
                      >
                        <div className="font-medium">{RECALL_SEVERITY_LABELS[option]}</div>
                        <div className="text-xs text-muted-foreground">
                          {RECALL_SEVERITY_HINTS[option]}
                        </div>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {impact.totals.customers > 0 && (
                  <Alert>
                    <TriangleAlertIcon />
                    <AlertTitle>
                      {countOf(impact.totals.customers, 'cliente recebeu', 'clientes receberam')}{' '}
                      produto
                    </AlertTitle>
                    <AlertDescription>
                      Depois de executar, a lista de contatos fica no detalhe do recall.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end">
                  <Button variant="destructive" onClick={onExecute} disabled={create.isPending}>
                    <SirenIcon />
                    Executar recall
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {confirming && lot && impact && (
        <ExecuteDialog
          lot={lot}
          impact={impact}
          pending={create.isPending}
          error={create.error}
          onConfirm={() => create.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
