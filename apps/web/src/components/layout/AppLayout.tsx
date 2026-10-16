import { Suspense, useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { PageSkeleton } from './PageSkeleton';

const COLLAPSED_KEY = 'traceflow.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Ignorado: vale só nesta aba.
  }
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const location = useLocation();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current);
      return !current;
    });
  }, []);

  return (
    <div className="flex min-h-svh">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 md:py-8 lg:px-8"
        >
          {/* `key`: troca de página mostra o esqueleto em vez de travar a tela anterior. */}
          <Suspense key={location.pathname} fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
