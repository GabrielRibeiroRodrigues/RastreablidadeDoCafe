import { useCallback, useSyncExternalStore } from 'react';

/** Acompanha uma media query (sem `matchMedia`, como no jsdom, responde `false`). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Abaixo de `md` (768 px): tabelas viram listas de cartões. */
export const useIsMobile = () => useMediaQuery('(max-width: 767.98px)');
