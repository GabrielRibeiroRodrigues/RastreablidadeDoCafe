import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';

interface EntityComboboxProps<T extends { id: string }> {
  id?: string;
  value: T | null;
  onChange: (value: T | null) => void;
  onBlur?: () => void;
  /** Busca no servidor (`q` vazio = primeiros itens). */
  search: (q: string, signal: AbortSignal) => Promise<T[]>;
  /** Raiz da query key do TanStack Query (ex.: `products`). */
  queryKey: string;
  getLabel: (item: T) => string;
  renderOption?: (item: T) => ReactNode;
  placeholder?: string;
  invalid?: boolean;
  /** Mostra o botão de limpar (campo opcional). */
  clearable?: boolean;
  disabled?: boolean;
}

function useDebounced<V>(value: V, delay = 250): V {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Select com busca no servidor (padrão WAI-ARIA combobox + listbox): digitar filtra,
 * ↑/↓ navegam, Enter escolhe, Esc fecha. Usado para produto e fornecedor no recebimento.
 */
export function EntityCombobox<T extends { id: string }>({
  id,
  value,
  onChange,
  onBlur,
  search,
  queryKey,
  getLabel,
  renderOption,
  placeholder = 'Buscar…',
  invalid,
  clearable,
  disabled,
}: EntityComboboxProps<T>) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim());
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: [queryKey, 'combobox', q],
    queryFn: ({ signal }) => search(q, signal),
    enabled: open,
    staleTime: 30_000,
  });
  const items = query.data ?? [];

  const choose = (item: T) => {
    onChange(item);
    setOpen(false);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setText('');
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={value ? getLabel(value) : placeholder}
        value={open ? text : value ? getLabel(value) : ''}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setText('');
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        className={cn('pr-14', value && !open && 'font-medium')}
      />
      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-muted-foreground">
        {clearable && value && !disabled && (
          <button
            type="button"
            className="pointer-events-auto rounded-sm hover:text-foreground"
            aria-label="Limpar seleção"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(null)}
          >
            <XIcon className="size-4" />
          </button>
        )}
        <ChevronsUpDownIcon className="size-4 opacity-60" aria-hidden />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {query.isPending ? (
            <li className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden /> Carregando…
            </li>
          ) : query.isError ? (
            <li className="px-2 py-2 text-destructive">{getErrorMessage(query.error)}</li>
          ) : items.length === 0 ? (
            <li className="px-2 py-2 text-muted-foreground">Nenhum resultado.</li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={value?.id === item.id}
                // Antes do blur do input, para a escolha não se perder.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
                  index === active && 'bg-accent text-accent-foreground',
                )}
              >
                <CheckIcon
                  className={cn('size-4 shrink-0', value?.id === item.id ? '' : 'invisible')}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">{renderOption?.(item) ?? getLabel(item)}</div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
