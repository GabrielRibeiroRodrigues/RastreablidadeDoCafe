import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchema } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type AppNotification = ApiSchema<'NotificationResponse'>;
export type NotificationCategory = ApiSchema<'NotificationCategory'>;

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  recall: 'Recalls',
  expiry: 'Validade de lotes',
  quality: 'Não conformidades',
};

/** Atualização da central: a cada minuto e quando a aba volta ao foco. */
const POLL_MS = 60_000;

const keys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

export function useUnreadCount() {
  return useQuery({
    queryKey: keys.unread,
    queryFn: ({ signal }) =>
      unwrap(getApiClient().GET('/v1/notifications/unread-count', { signal })),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Últimos 20 avisos (lidos e não lidos); só carrega com a central aberta. */
export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: keys.list,
    queryFn: ({ signal }) =>
      unwrap(
        getApiClient().GET('/v1/notifications', {
          params: { query: { pageSize: 20 } },
          signal,
        }),
      ),
    enabled,
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(getApiClient().POST('/v1/notifications/{id}/read', { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(getApiClient().POST('/v1/notifications/read-all')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useNotificationPreferences(enabled: boolean) {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: ({ signal }) =>
      unwrap(getApiClient().GET('/v1/notifications/preferences', { signal })),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSetMuted() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (muted: NotificationCategory[]) =>
      unwrap(getApiClient().PUT('/v1/notifications/preferences', { body: { muted } })),
    onSuccess: (data) => client.setQueryData(keys.preferences, data),
  });
}
