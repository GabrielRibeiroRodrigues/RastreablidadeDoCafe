import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type LazyPage = LazyExoticComponent<ComponentType> & {
  /** Baixa o código da página antes da navegação (hover/foco no link). */
  preload: () => Promise<unknown>;
};

/**
 * Página carregada sob demanda (`React.lazy`), com `preload` para pré-carregar no hover.
 * A promessa é memorizada: o chunk é baixado uma única vez.
 */
export function lazyPage<M>(load: () => Promise<M>, pick: (module: M) => ComponentType): LazyPage {
  let promise: Promise<{ default: ComponentType }> | undefined;
  const preload = () => {
    promise ??= load().then(
      (module) => ({ default: pick(module) }),
      (error: unknown) => {
        // Falha de rede/deploy novo: permite tentar de novo no próximo preload.
        promise = undefined;
        throw error;
      },
    );
    return promise;
  };
  return Object.assign(lazy(preload), { preload });
}
