import { createContext, useContext } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Mesma chave lida pelo script inline do `index.html` (evita o "flash" do tema errado). */
export const THEME_STORAGE_KEY = 'traceflow.theme';

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
};

/** Cor da barra do navegador (meta `theme-color`) em cada tema: o tom da barra lateral. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#2b211b',
  dark: '#211a16',
};

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/** localStorage pode lançar (modo privado, política do navegador): cai no tema do sistema. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignorado: a escolha vale só nesta aba.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/** Aplica o tema no `<html>` (classe `dark`, `color-scheme` e `theme-color`). */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Sem provider (testes de componentes isolados): tema claro, sem alternância. */
const FALLBACK: ThemeContextValue = {
  preference: 'system',
  resolved: 'light',
  setPreference: () => undefined,
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK;
}

export function useResolvedTheme(): ResolvedTheme {
  return useTheme().resolved;
}
