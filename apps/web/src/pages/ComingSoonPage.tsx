import { HammerIcon } from 'lucide-react';
import { Link } from 'react-router';
import { findNavLink } from '@/app/navigation';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

/** Rota reservada para um módulo do roadmap (Recall, Qualidade, Auditoria). */
export function ComingSoonPage({ path }: { path: string }) {
  const item = findNavLink(path);
  const title = item?.label ?? 'Em breve';
  const Icon = item?.icon ?? HammerIcon;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={item?.description}
        breadcrumbs={[{ label: 'Qualidade' }, { label: title }]}
        badges={
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Em breve
          </span>
        }
      />
      <EmptyState
        bordered
        icon={Icon}
        title="Módulo em construção"
        description="Esta área faz parte do roadmap do TraceFlow e chega numa próxima versão. Os dados de lotes, produção e expedições já registrados serão usados por ela."
        action={
          <Button variant="outline" asChild>
            <Link to="/">Voltar ao painel</Link>
          </Button>
        }
      />
    </div>
  );
}
