import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  readThemePreference,
  systemPrefersDark,
  ThemeContext,
  writeThemePreference,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemePreference,
} from './theme';

/**
 * Tema claro/escuro/sistema. O script inline do `index.html` já aplicou a classe antes do
 * primeiro paint; aqui o tema é mantido em sincronia com a escolha e com o sistema operacional.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => applyTheme(resolved), [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
