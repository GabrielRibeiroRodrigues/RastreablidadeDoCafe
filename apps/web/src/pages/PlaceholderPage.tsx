import { PlusIcon } from 'lucide-react';
import type { NavItem } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** Página provisória dos cadastros até o cliente OpenAPI existir. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  const { icon: Icon, label, newLabel, description } = item;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Button disabled>
          <PlusIcon />
          {newLabel}
        </Button>
      </div>

      <Card className="border-dashed shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Icon className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-medium">Em breve</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              A listagem e o cadastro de {label.toLowerCase()} serão liberados assim que o cliente
              da API estiver disponível.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
