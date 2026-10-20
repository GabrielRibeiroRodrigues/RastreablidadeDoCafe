const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/** "agora", "há 5 minutos", "ontem", "há 3 dias". */
export function timeAgo(date: string, now = Date.now()): string {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'agora';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}
