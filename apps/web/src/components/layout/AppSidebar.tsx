import { NavLink } from 'react-router';
import { cn } from 'cn';
import { NAV_ITEMS, UPCOMING_ITEMS } from '@/app/navigation';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/auth/auth-context';

export function AppSidebar() {
  const { mode } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center border-b border-sidebar-border px-5">
        <BrandMark inverted />
      </div>

      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-2 pb-2 text-[0.7rem] font-medium tracking-wider text-sidebar-muted uppercase">
          Cadastros
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                    isActive
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon
                      className={cn('size-4', isActive ? 'text-sidebar-primary' : 'opacity-70')}
                      aria-hidden
                    />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <p className="px-2 pt-6 pb-2 text-[0.7rem] font-medium tracking-wider text-sidebar-muted uppercase">
          Em breve
        </p>
        <ul className="space-y-0.5" aria-label="Módulos em desenvolvimento">
          {UPCOMING_ITEMS.map(({ label, icon: Icon }) => (
            <li
              key={label}
              aria-disabled
              className="flex cursor-default items-center gap-3 px-2.5 py-2 text-sm text-sidebar-muted/80"
            >
              <Icon className="size-4 opacity-60" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </nav>

      {mode === 'mock' && (
        <div className="border-t border-sidebar-border px-5 py-3 text-xs text-sidebar-muted">
          <span className="mr-1.5 inline-block size-1.5 rounded-full bg-sidebar-primary align-middle" />
          Ambiente de desenvolvimento
        </div>
      )}
    </aside>
  );
}
