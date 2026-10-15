import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Option } from '@/lib/options';

/** O Radix Select não aceita `""` como valor; este representa "sem filtro". */
const ALL = '__all__';

export type { Option };

interface FilterSelectProps {
  label: string;
  /** Rótulo da opção "sem filtro" (ex.: "Todos os tipos"). */
  allLabel: string;
  options: readonly Option[];
  value: string | undefined;
  onChange: (value: string | null) => void;
}

export function FilterSelect({ label, allLabel, options, value, onChange }: FilterSelectProps) {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger aria-label={label} className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
