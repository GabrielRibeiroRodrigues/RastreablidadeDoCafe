import { useEffect } from 'react';

export const APP_NAME = 'TraceFlow';

/** `document.title` da página: "Lotes · TraceFlow" (vazio = só o nome do produto). */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
