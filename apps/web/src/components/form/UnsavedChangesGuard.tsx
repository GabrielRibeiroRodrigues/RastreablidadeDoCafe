import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '@/components/catalog/ConfirmDialog';

/**
 * Protege formulários longos: com alterações não salvas, pede confirmação antes de sair pela
 * navegação do app e ativa o aviso nativo do navegador ao fechar/recarregar a aba.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title="Sair sem salvar?"
      description="Os dados preenchidos neste formulário serão perdidos."
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      destructive
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  );
}
