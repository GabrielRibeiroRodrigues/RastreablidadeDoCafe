import { Building2Icon, ChevronDownIcon, LogOutIcon, MenuIcon } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { NAV_ITEMS, OPERATION_ITEMS, PRODUCTION_ITEMS } from '@/app/navigation';
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
import { getErrorMessage } from '@/lib/api';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function AppHeader() {
  const { user, logout } = useAuth();
  // A empresa vem de `GET /v1/me` (nos dois modos); o nome do login mock é só o valor inicial.
  const me = useMe();
  const companyName = me.data?.company.name ?? user?.companyName ?? null;

  const handleLogout = () => {
    logout().catch((error: unknown) => toast.error(getErrorMessage(error)));
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
      {/* Navegação compacta para telas pequenas (a barra lateral some abaixo de md). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
            <MenuIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {[...OPERATION_ITEMS, ...PRODUCTION_ITEMS, ...NAV_ITEMS].map(
            ({ path, label, icon: Icon }) => (
              <DropdownMenuItem key={path} asChild>
                <Link to={path}>
                  <Icon />
                  {label}
                </Link>
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <BrandMark className="md:hidden [&_svg]:size-7" />

      {companyName && (
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <Building2Icon className="size-4" aria-hidden />
          <span className="font-medium text-foreground">{companyName}</span>
        </div>
      )}

      <div className="ml-auto">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-2.5 px-2" aria-label="Menu do usuário">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden flex-col items-start leading-tight sm:flex">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.roles.map((role) => ROLE_LABELS[role]).join(' · ') || 'Sem perfil'}
                  </span>
                </span>
                <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-1.5 py-2 font-normal">
                <div className="text-sm font-medium text-foreground">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                {companyName && <div className="text-xs text-muted-foreground">{companyName}</div>}
                {user.roles.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {ROLE_LABELS[role]}
                      </Badge>
                    ))}
                  </div>
                )}
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
