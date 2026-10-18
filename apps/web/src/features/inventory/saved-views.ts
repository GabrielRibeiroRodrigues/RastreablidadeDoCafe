import { useCallback, useState } from 'react';

/** Filtro salvo da tela Lotes: um nome e a query string da URL (sem a página). */
export interface SavedView {
  name: string;
  search: string;
}

const MAX_VIEWS = 8;
const keyFor = (userId: string) => `traceflow.lots.views.${userId}`;

function read(userId: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedView =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as SavedView).name === 'string' &&
            typeof (item as SavedView).search === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function write(userId: string, views: SavedView[]): void {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(views));
  } catch {
    // Armazenamento indisponível (modo privado): a visão vale só nesta sessão.
  }
}

/** Remove a paginação: uma visão salva abre sempre na primeira página. */
export function viewSearch(params: URLSearchParams): string {
  const copy = new URLSearchParams(params);
  copy.delete('page');
  copy.sort();
  return copy.toString();
}

/**
 * Visões salvas da tela Lotes, por usuário, no navegador (conveniência pessoal — não vai para a
 * API). Mesmo nome substitui; no máximo 8.
 */
export function useSavedViews(userId: string | undefined) {
  const [views, setViews] = useState<SavedView[]>(() => (userId ? read(userId) : []));

  const update = useCallback(
    (next: SavedView[]) => {
      setViews(next);
      if (userId) write(userId, next);
    },
    [userId],
  );

  const save = (name: string, search: string) =>
    update([{ name, search }, ...views.filter((view) => view.name !== name)].slice(0, MAX_VIEWS));
  const remove = (name: string) => update(views.filter((view) => view.name !== name));

  return { views, save, remove };
}
