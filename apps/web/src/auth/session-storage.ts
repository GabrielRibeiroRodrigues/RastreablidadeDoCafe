import { ROLES } from '@traceflow/shared';
import { z } from 'zod';
import { isTokenExpired } from '@/lib/jwt';
import type { AuthSession } from './types';

const STORAGE_KEY = 'traceflow.auth.session';

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    roles: z.array(z.enum(ROLES)),
    companyName: z.string().nullable(),
  }),
});

/**
 * Persistência da sessão do modo mock. sessionStorage pode lançar exceção
 * (modo privado, cota, política do navegador): nesse caso a sessão vive só em memória.
 */
export const sessionStore = {
  read(): AuthSession | null {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = sessionSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || isTokenExpired(parsed.data.accessToken)) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  },

  write(session: AuthSession): void {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignorado: a sessão continua em memória.
    }
  },

  clear(): void {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignorado.
    }
  },
};
