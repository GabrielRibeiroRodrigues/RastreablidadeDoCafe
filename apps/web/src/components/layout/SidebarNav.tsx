import { NavLink } from 'react-router';
import { cn } from 'cn';
import { NAV_SECTIONS, type NavLinkItem } from '@/app/navigation';
import { preloadRoute } from '@/app/pages';
import { useInventoryPermissions } from '@/auth/permissions';

interface SidebarNavProps {
  /** Só ícones (barra recolhida no desktop). */
  collapsed?: boolean;
  /** Chamado ao escolher um link (fecha a gaveta no celular). */
  onNavigate?: () => void;
}

function SoonBadge() {
  return (
    <span className="ml-auto rounded-full border border-sidebar-border px-1.5 py-px text-[0.625rem] font-medium tracking-wide text-sidebar-muted uppercase">
      Em breve
    </span>
  );
}

function NavEntry({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavLinkItem;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const { path, label, icon: Icon, soon } = item;
  return (
    <NavLink
      to={path}
      end={path === '/'}
      title={collapsed ? (soon ? `${label} (em breve)` : label) : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onNavigate}
      onMouseEnter={() => preloadRoute(path)}
      onFocus={() => preloadRoute(path)}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : soon
              ? 'text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
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
            className={cn('size-4 shrink-0', isActive ? 'text-sidebar-primary' : 'opacity-75')}
            aria-hidden
          />
          {!collapsed && <span className="truncate">{label}</span>}
          {!collapsed && soon && <SoonBadge />}
        </>
      )}
    </NavLink>
  );
}

/** Links da barra lateral, agrupados por seção (mesmo conteúdo no desktop e na gaveta). */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { canOperate } = useInventoryPermissions();

  return (
    <nav aria-label="Navegação principal" className="space-y-5">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((item) => !item.requiresOperate || canOperate);
        if (items.length === 0) return null;
        return (
          <div key={section.title}>
            {collapsed ? (
              <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
            ) : (
              <p className="px-2.5 pb-1.5 text-[0.7rem] font-medium tracking-wider text-sidebar-muted uppercase">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5" aria-label={collapsed ? section.title : undefined}>
              {items.map((item) => (
                <li key={item.path}>
                  <NavEntry item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
