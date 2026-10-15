import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from 'cn';
import { BrandMark } from '@/components/BrandMark';
import { SidebarNav } from './SidebarNav';

/** Barra lateral do desktop (md+): recolhível para só ícones; a escolha fica salva. */
export function AppSidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center' : 'px-4',
        )}
      >
        <Link to="/" aria-label="TraceFlow — Painel" className="rounded-md">
          <BrandMark inverted compact={collapsed} />
        </Link>
      </div>

      <div className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        <SidebarNav collapsed={collapsed} />
      </div>

      <div className={cn('border-t border-sidebar-border p-2', !collapsed && 'px-3')}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
            collapsed && 'justify-center px-0',
          )}
        >
          <ToggleIcon className="size-4" aria-hidden />
          {!collapsed && 'Recolher'}
        </button>
      </div>
    </aside>
  );
}
