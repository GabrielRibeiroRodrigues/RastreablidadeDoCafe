import { useEffect } from 'react';
import { toast } from 'sonner';

const OFFLINE_TOAST = 'network-offline';

/** Avisa quando o navegador perde/recupera a conexão (toast fixo enquanto estiver offline). */
export function NetworkStatus() {
  useEffect(() => {
    const offline = () =>
      toast.warning('Você está sem conexão', {
        id: OFFLINE_TOAST,
        description: 'As alterações não serão salvas até a conexão voltar.',
        duration: Infinity,
      });
    const online = () => {
      toast.dismiss(OFFLINE_TOAST);
      toast.success('Conexão restabelecida', { duration: 3000 });
    };
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  return null;
}
