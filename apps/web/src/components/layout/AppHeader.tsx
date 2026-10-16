import { Building2Icon, ChevronDownIcon, FlaskConicalIcon, LogOutIcon } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { ROLE_LABELS } from '@/auth/roles';
import { useMe } from '@/auth/use-me';
import { BrandMark } from '@/components/BrandMark';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExpiryBell } from '@/features/alerts/ExpiryBell';
import { getErrorMessage } from '@/lib/api';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { MobileNav } from './MobileNav';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/** Selo exibido só com login simulado (`VITE_AUTH_MODE=mock`). */
function DevEnvironmentBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning-foreground"
      title="Login simulado: usuários de teste, sem Cognito"
    >
      <FlaskConicalIcon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Ambiente de desenvolvimento</span>
      <span className="sm:hidden">Dev</span>
    </span>
  );
}

export function AppHeader() {
  const { user, logout, mode } = useAuth();
  // A empresa vem de `GET /v1/me` (nos dois modos); o nome do login mock é só o valor inicial.
  const me = useMe();
  const companyName = me.data?.company.name ?? user?.companyName ?? null;
  const primaryRole = user?.roles[0];

  const handleLogout = () => {
    logout().catch((error: unknown) => toast.error(getErrorMessage(error)));
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:gap-3 md:px-6">
      <MobileNav />
      <Link to="/" className="rounded-md md:hidden" aria-label="TraceFlow — Painel">
        <BrandMark compact className="[&_svg]:size-7" />
      </Link>

      {companyName && (
        <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex">
          <Building2Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate font-medium text-foreground">{companyName}</span>
        </div>
      )}
      {mode === 'mock' && <DevEnvironmentBadge />}

      <div className="ml-auto flex items-center gap-1">
        {user && <ExpiryBell />}
        <ThemeToggle />
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-10 gap-2.5 px-1.5 sm:px-2"
                aria-label="Menu do usuário"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden flex-col items-start leading-tight lg:flex">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {primaryRole ? ROLE_LABELS[primaryRole] : 'Sem perfil'}
                  </span>
                </span>
                <ChevronDownIcon
                  className="hidden size-4 text-muted-foreground sm:block"
                  aria-hidden
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-1.5 py-2 font-normal">
                <div className="text-sm font-medium text-foreground">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                {companyName && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2Icon className="size-3.5" aria-hidden />
                    {companyName}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {user.roles.length > 0 ? (
                    user.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {ROLE_LABELS[role]}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">Sem perfil</Badge>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOutIcon />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
