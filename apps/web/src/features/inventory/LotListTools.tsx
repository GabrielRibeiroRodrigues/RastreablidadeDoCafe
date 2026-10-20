import { BookmarkPlusIcon, DownloadIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
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
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/api';
import { downloadFromApi } from '@/lib/download';
import { countOf } from '@/lib/plural';
import { useSavedViews, viewSearch } from './saved-views';

/**
 * Visões salvas da tela Lotes: chips que reaplicam um conjunto de filtros e um botão para salvar
 * os filtros atuais com um nome. Ficam no navegador do usuário.
 */
export function SavedViews() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { views, save, remove } = useSavedViews(user?.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const current = viewSearch(params);
  // Só oferece salvar quando há filtro e ele ainda não é uma visão salva.
  const canSave = current !== '' && !views.some((view) => view.search === current);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    save(trimmed.slice(0, 40), current);
    setOpen(false);
    setName('');
    toast.success(`Visão "${trimmed}" salva`);
  };

  return (
    <>
      {views.map((view) => {
        const active = view.search === current;
        return (
          <span key={view.name} className="inline-flex items-center">
            <Button
              size="sm"
              variant={active ? 'secondary' : 'outline'}
              aria-pressed={active}
              className="rounded-l-full rounded-r-none pr-2"
              onClick={() => setParams(new URLSearchParams(view.search))}
            >
              {view.name}
            </Button>
            <Button
              size="sm"
              variant={active ? 'secondary' : 'outline'}
              className="-ml-px rounded-l-none rounded-r-full px-2 text-muted-foreground"
              aria-label={`Remover a visão ${view.name}`}
              title="Remover visão"
              onClick={() => remove(view.name)}
            >
              <XIcon />
            </Button>
          </span>
        );
      })}
      {canSave && (
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <BookmarkPlusIcon />
          Salvar filtros
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Salvar filtros</DialogTitle>
              <DialogDescription>
                A visão fica neste navegador e aparece ao lado de “Vencendo”.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="view-name">Nome</Label>
              <Input
                id="view-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Bourbon em quarentena"
                maxLength={40}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Baixa a planilha dos lotes com os filtros e a ordem atuais da tela. */
export function ExportLotsButton({ query }: { query: Record<string, string | undefined> }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const result = await downloadFromApi('/v1/reports/lots.csv', query, 'lotes.csv');
      if (result.truncated) {
        toast.warning('Planilha cortada no limite de linhas: filtre um período menor.');
      } else {
        toast.success(
          result.rows === null
            ? 'Planilha baixada'
            : `Planilha com ${countOf(result.rows, 'lote', 'lotes')} baixada`,
        );
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={() => void run()} disabled={busy}>
      {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      Exportar CSV
    </Button>
  );
}
