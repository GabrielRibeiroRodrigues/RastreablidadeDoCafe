import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_LABELS, useTheme, type ThemePreference } from './theme';

const ICONS: Record<ThemePreference, LucideIcon> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

/** Botão do cabeçalho: escolhe entre tema do sistema, claro e escuro. */
export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const Icon = resolved === 'dark' ? MoonIcon : SunIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Tema: ${THEME_LABELS[preference]}. Alterar tema`}
          title="Alterar tema"
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          {OPTIONS.map((option) => {
            const OptionIcon = ICONS[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <OptionIcon aria-hidden />
                {THEME_LABELS[option]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
