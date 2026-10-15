export interface Option<V extends string = string> {
  value: V;
  label: string;
}

/** `{ GREEN: 'Café verde' }` → `[{ value: 'GREEN', label: 'Café verde' }]` (para selects). */
export function toOptions<K extends string>(labels: Record<K, string>): Option<K>[] {
  return (Object.entries(labels) as Array<[K, string]>).map(([value, label]) => ({
    value,
    label,
  }));
}
