import {
  BellIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  ClipboardCheckIcon,
  SirenIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALERT_DAYS, useExpiringLots } from '@/features/alerts/api';
import { getErrorMessage } from '@/lib/api';
import { countOf, plural } from '@/lib/plural';
import { timeAgo } from '@/lib/time';
import {
  CATEGORY_LABELS,
  useMarkAllRead,
  useMarkRead,
  useNotificationPreferences,
  useNotifications,
  useSetMuted,
  useUnreadCount,
  type AppNotification,
  type NotificationCategory,
} from './api';

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  recall: SirenIcon,
  expiry: CalendarClockIcon,
  quality: ClipboardCheckIcon,
};

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
}) {
  const Icon = CATEGORY_ICONS[notification.category];
  const unread = !notification.readAt;
  return (
    <DropdownMenuItem
      className="items-start gap-3 py-2.5"
      onSelect={() => onOpen(notification)}
      aria-label={`${unread ? 'Não lido: ' : ''}${notification.title}`}
    >
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
          notification.category === 'recall'
            ? 'bg-destructive/10 text-destructive'
            : notification.category === 'expiry'
              ? 'bg-warning/15 text-warning-foreground'
              : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span
          className={cn(
            'line-clamp-2 block text-sm leading-snug',
            unread ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          {notification.title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {timeAgo(notification.createdAt)}
        </span>
      </span>
      {unread && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
    </DropdownMenuItem>
  );
}

/**
 * Central de avisos do cabeçalho: lotes vencendo (ao vivo) no topo e, abaixo, os avisos do
 * usuário (recall, validade, não conformidade), com "marcar como lido" e categorias silenciáveis.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = useUnreadCount().data?.unread ?? 0;
  const expiring = useExpiringLots();
  const list = useNotifications(open);
  const preferences = useNotificationPreferences(open);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const setMuted = useSetMuted();

  const expiringCount = expiring.data?.data.length ?? 0;
  const expiredCount = expiring.data?.expiredCount ?? 0;
  const muted = preferences.data?.muted ?? [];
  const notifications = list.data?.data ?? [];

  const label = unread > 0 ? `Avisos: ${countOf(unread, 'não lido', 'não lidos')}` : 'Avisos';

  const openNotification = (notification: AppNotification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.link) void navigate(notification.link);
  };

  const toggleCategory = (category: NotificationCategory, receive: boolean) => {
    const next = receive ? muted.filter((c) => c !== category) : [...muted, category];
    setMuted.mutate(next, {
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label}>
          <BellIcon />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-4 font-semibold text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : (
            expiringCount > 0 && (
              <span
                aria-hidden
                className="absolute top-2 right-2 size-2 rounded-full bg-warning ring-2 ring-background"
              />
            )
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-foreground">
            Avisos
          </DropdownMenuLabel>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheckIcon />
              Marcar todos como lidos
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />

        {expiringCount > 0 && (
          <>
            <DropdownMenuItem asChild className="gap-3 rounded-none bg-warning/10 px-3 py-2.5">
              <Link to={`/lotes?vencendo=${ALERT_DAYS}`}>
                <CalendarClockIcon className="text-warning-foreground" aria-hidden />
                <span className="text-sm">
                  {countOf(expiringCount, 'lote vencendo', 'lotes vencendo')} em {ALERT_DAYS} dias
                  {expiredCount > 0 &&
                    ` (${expiredCount} ${plural(expiredCount, 'vencido', 'vencidos')})`}
                </span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-0" />
          </>
        )}

        <div className="max-h-[min(24rem,60svh)] overflow-y-auto p-1">
          {list.isPending ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : list.isError ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">
              Não foi possível carregar os avisos.
            </p>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <BellIcon className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden />
              <p className="text-sm font-medium">Nenhum aviso por aqui</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Recalls, validade e não conformidades aparecem aqui.
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onOpen={openNotification}
              />
            ))
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs text-muted-foreground">
              Preferências de avisos
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Receber na central
              </DropdownMenuLabel>
              {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((category) => (
                <DropdownMenuCheckboxItem
                  key={category}
                  checked={!muted.includes(category)}
                  disabled={preferences.isPending || setMuted.isPending}
                  onCheckedChange={(checked) => toggleCategory(category, checked)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {CATEGORY_LABELS[category]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
