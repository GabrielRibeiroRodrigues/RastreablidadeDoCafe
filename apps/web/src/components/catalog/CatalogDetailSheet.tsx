import { PencilIcon } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/quantity';
import type { CatalogEntity, DetailField } from './types';

const isEmpty = (value: DetailField['value']) =>
  value === null || value === undefined || value === '' || value === false;

/** Ficha somente leitura de um cadastro (gaveta à direita), com todos os campos. */
export function CatalogDetailSheet<T extends CatalogEntity>({
  entity,
  title,
  kind,
  fields,
  onClose,
  onEdit,
}: {
  entity: T | null;
  title: string;
  /** Tipo do cadastro no singular (ex.: "Produto"). */
  kind: string;
  fields: DetailField[];
  onClose: () => void;
  /** Só para quem pode editar. */
  onEdit?: (() => void) | undefined;
}) {
  return (
    <Sheet open={entity !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        {entity && (
          <>
            <SheetHeader>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {kind}
              </p>
              <SheetTitle className="text-lg">{title}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-2">
                  {entity.isActive ? (
                    <Badge variant="secondary">Ativo</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inativo
                    </Badge>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                {fields.map((field) => (
                  <div
                    key={field.label}
                    className={cn('min-w-0 space-y-1', field.wide && 'col-span-2')}
                  >
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="text-sm font-medium break-words whitespace-pre-line">
                      {isEmpty(field.value) ? (
                        <span className="font-normal text-muted-foreground">—</span>
                      ) : (
                        field.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-5 text-xs text-muted-foreground">
                <div>
                  <dt>Criado em</dt>
                  <dd className="text-foreground tabular-nums">
                    {formatDateTime(entity.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt>Atualizado em</dt>
                  <dd className="text-foreground tabular-nums">
                    {formatDateTime(entity.updatedAt)}
                  </dd>
                </div>
              </dl>
            </SheetBody>
            {onEdit && (
              <SheetFooter>
                <Button onClick={onEdit}>
                  <PencilIcon />
                  Editar
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
