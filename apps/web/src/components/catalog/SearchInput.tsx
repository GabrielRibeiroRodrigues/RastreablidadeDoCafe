import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Espera entre a última tecla e a busca (ms). */
  delay?: number;
}

/** Campo de busca com debounce; acompanha mudanças externas (ex.: voltar no navegador). */
export function SearchInput({ value, onChange, placeholder, delay = 300 }: SearchInputProps) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Valor externo mudou (URL): sincroniza o texto, sem apagar espaços que o usuário digitou.
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return undefined;
    const timer = window.setTimeout(() => onChangeRef.current(text), delay);
    return () => window.clearTimeout(timer);
  }, [text, value, delay]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        role="searchbox"
        aria-label="Buscar"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('');
            onChange('');
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Limpar busca"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
