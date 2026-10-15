import { XIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { cn } from 'cn';

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  maxTags?: number;
}

/** Lista de textos curtos (ex.: variedades): Enter ou vírgula adiciona, Backspace remove. */
export function TagInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  maxTags,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const full = maxTags !== undefined && value.length >= maxTags;

  const commit = () => {
    const tag = draft.trim().replace(/\s+/g, ' ');
    setDraft('');
    if (!tag || full) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        invalid && 'border-destructive ring-3 ring-destructive/20',
      )}
    >
      <ul className="contents" aria-label="Itens adicionados">
        {value.map((tag) => (
          <li
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-secondary pr-1 pl-2 text-xs font-medium text-secondary-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Remover ${tag}`}
            >
              <XIcon className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          commit();
          onBlur?.();
        }}
        disabled={full}
        aria-invalid={invalid}
        placeholder={full ? 'Limite atingido' : placeholder}
        className="h-6 min-w-32 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}
