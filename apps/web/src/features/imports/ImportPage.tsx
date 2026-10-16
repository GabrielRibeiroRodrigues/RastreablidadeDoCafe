import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  LockIcon,
  RotateCcwIcon,
  UploadIcon,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { cn } from 'cn';
import { useQualityPermissions } from '@/auth/permissions';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getErrorMessage, translateFieldMessage } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import {
  IMPORT_ENTITY_LABELS,
  IMPORT_MAX_BYTES,
  IMPORT_TEMPLATES,
  runImport,
  templateCsv,
  type ImportEntity,
  type ImportResult,
} from './api';

const CRUMBS = [{ label: 'Gestão' }, { label: 'Importação' }];
const ENTITIES = Object.keys(IMPORT_ENTITY_LABELS) as ImportEntity[];
const ROUTES: Record<ImportEntity, string> = {
  products: '/produtos',
  suppliers: '/fornecedores',
  customers: '/clientes',
  locations: '/locais',
};

/** Mensagens comuns da importação (em inglês na API) → pt-BR. */
function importMessage(message: string): string {
  let m = /repeats line (\d+)/i.exec(message);
  if (m) return `Valor repetido (já aparece na linha ${m[1]}).`;
  if (/already exists/i.test(message)) return 'Já existe um cadastro com este valor.';
  m = /must be one of the following values:\s*(.+)$/i.exec(message);
  if (m) return `Valor inválido. Use um destes: ${m[1]}.`;
  m = /unknown column/i.exec(message);
  if (m) return `Coluna desconhecida: ${message.replace(/^.*?:\s*/, '')}`;
  if (/missing required column/i.test(message)) {
    return `Coluna obrigatória ausente: ${message.replace(/^.*?:\s*/, '')}`;
  }
  if (/more cells than the header/i.test(message))
    return 'A linha tem mais células que o cabeçalho.';
  return translateFieldMessage(message);
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</div>
    </div>
  );
}

export function ImportPage() {
  const { canImport } = useQualityPermissions();
  const queryClient = useQueryClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>('products');
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);

  const dryRun = useMutation({
    mutationFn: (target: File) => runImport(entity, target, true),
    onSuccess: (result) => setCheck(result),
    onError: (error) =>
      toast.error('Não foi possível validar o arquivo', { description: getErrorMessage(error) }),
  });
  const commit = useMutation({
    mutationFn: (target: File) => runImport(entity, target, false),
    onSuccess: async (result) => {
      if (result.created > 0) {
        setDone(result);
        toast.success(`${result.created} cadastro(s) importado(s)`);
        await queryClient.invalidateQueries({ queryKey: [entity] });
      } else {
        // Algo mudou entre a validação e o envio (ex.: outro usuário cadastrou o mesmo SKU).
        setCheck(result);
        toast.error('Nada foi importado', { description: 'O arquivo tem erros; veja a lista.' });
      }
    },
    onError: (error) =>
      toast.error('Não foi possível importar', { description: getErrorMessage(error) }),
  });

  const reset = () => {
    setFile(null);
    setCheck(null);
    setDone(null);
    dryRun.reset();
    commit.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  if (!canImport) {
    return (
      <div className="space-y-6">
        <PageHeader title="Importação" breadcrumbs={CRUMBS} />
        <EmptyState
          bordered
          icon={LockIcon}
          title="Acesso restrito"
          description="A importação de cadastros por planilha é feita por administradores."
        />
      </div>
    );
  }

  const onFile = (next: File | undefined) => {
    setCheck(null);
    setDone(null);
    commit.reset();
    if (!next) return;
    if (next.size === 0) {
      toast.error('Arquivo vazio');
      return;
    }
    if (next.size > IMPORT_MAX_BYTES) {
      toast.error('Arquivo muito grande', { description: 'O limite é 2 MB (até 5.000 linhas).' });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(next);
    dryRun.mutate(next);
  };

  const template = IMPORT_TEMPLATES[entity];
  const canCommit = Boolean(file && check && check.invalid === 0 && check.total > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação"
        breadcrumbs={CRUMBS}
        description="Carga de cadastros por planilha CSV. O arquivo é validado primeiro (nada é gravado); a importação só é liberada sem nenhum erro e grava tudo de uma vez."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Cadastro</CardTitle>
          <CardDescription>{template.notes}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {ENTITIES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={entity === option}
                onClick={() => {
                  setEntity(option);
                  reset();
                }}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  entity === option
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-muted/60',
                )}
              >
                {IMPORT_ENTITY_LABELS[option]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {template.columns.map((column) => (
                <li
                  key={column.name}
                  title={column.hint}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono',
                    column.required && 'border-primary/50 font-semibold',
                  )}
                >
                  {column.name}
                  {column.required && <span className="text-destructive">*</span>}
                  {column.hint && (
                    <span className="ml-1 font-sans font-normal text-muted-foreground">
                      ({column.hint})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                saveBlob(
                  new Blob([templateCsv(entity)], { type: 'text/csv;charset=utf-8' }),
                  `modelo-${entity}.csv`,
                )
              }
            >
              <DownloadIcon />
              Baixar modelo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> obrigatória. Separador ; ou , · UTF-8 ou o
            CSV padrão do Excel · célula vazia = não informado · até 2 MB e 5.000 linhas.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Arquivo</CardTitle>
          <CardDescription>Escolher o arquivo já roda a validação (sem gravar).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <Button asChild variant={file ? 'outline' : 'default'}>
            <label htmlFor={inputId} className="cursor-pointer">
              <UploadIcon />
              {file ? 'Trocar arquivo' : 'Escolher arquivo CSV'}
            </label>
          </Button>
          {file && (
            <span className="flex items-center gap-1.5 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" aria-hidden />
              {file.name}
              <span className="text-muted-foreground">
                ({(file.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB)
              </span>
            </span>
          )}
          {dryRun.isPending && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Validando…
            </span>
          )}
          {file && !dryRun.isPending && (
            <Button variant="ghost" size="sm" onClick={() => dryRun.mutate(file)}>
              <RotateCcwIcon />
              Validar de novo
            </Button>
          )}
        </CardContent>
        {dryRun.isError && (
          <CardContent>
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{getErrorMessage(dryRun.error)}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {done ? (
        <Alert className="border-emerald-600/40 bg-emerald-600/5">
          <CheckCircle2Icon className="text-emerald-700 dark:text-emerald-400" />
          <AlertTitle>
            {done.created} cadastro(s) de {IMPORT_ENTITY_LABELS[done.entity].toLowerCase()}{' '}
            importado(s)
          </AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link to={ROUTES[done.entity]}>Ver {IMPORT_ENTITY_LABELS[done.entity]}</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                Importar outro arquivo
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        check && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">3. Resultado da validação</h2>
            <div className="grid grid-cols-3 gap-3 sm:max-w-md">
              <Count label="Linhas" value={check.total} />
              <Count
                label="Válidas"
                value={check.valid}
                tone="text-emerald-700 dark:text-emerald-400"
              />
              <Count
                label="Com erro"
                value={check.invalid}
                tone={check.invalid > 0 ? 'text-destructive' : undefined}
              />
            </div>

            {check.errors.length > 0 ? (
              <div className="overflow-hidden rounded-xl border bg-card">
                <Table containerClassName="max-h-[28rem]">
                  <caption className="sr-only">Erros encontrados no arquivo</caption>
                  <TableHeader className="sticky top-0 bg-muted/95">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-20">Linha</TableHead>
                      <TableHead className="w-40">Campo</TableHead>
                      <TableHead>Problema</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {check.errors.map((error, index) => (
                      <TableRow key={`${error.line}-${error.field}-${index}`}>
                        <TableCell className="tabular-nums">{error.line}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {error.field === 'row' ? 'linha inteira' : error.field}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <ul>
                            {error.messages.map((message) => (
                              <li key={message} title={message}>
                                {importMessage(message)}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : check.total === 0 ? (
              <p className="text-sm text-muted-foreground">O arquivo não tem linhas de dados.</p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2Icon className="size-4" aria-hidden />
                Nenhum erro: o arquivo pode ser importado.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {!canCommit && check.invalid > 0 && (
                <span className="text-sm text-muted-foreground">
                  Corrija os erros no arquivo e escolha-o de novo.
                </span>
              )}
              <Button
                onClick={() => file && commit.mutate(file)}
                disabled={!canCommit || commit.isPending}
              >
                {commit.isPending ? (
                  <Loader2Icon className="animate-spin" aria-hidden />
                ) : (
                  <UploadIcon />
                )}
                {commit.isPending ? 'Importando…' : `Importar ${check.valid} cadastro(s)`}
              </Button>
            </div>
          </section>
        )
      )}
    </div>
  );
}
