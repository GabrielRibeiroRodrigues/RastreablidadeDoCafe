import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';

export interface TenantStore extends ClsStore {
  companyId?: string;
  userId?: string;
  /** Correlação da requisição (x-request-id) ou do job (ex.: `job:expiry-alert`). */
  requestId?: string;
  /** IP de origem da requisição (informativo, para auditoria). */
  ip?: string;
  /** Marcado quando o serviço já gravou auditoria explícita (o interceptor não duplica). */
  audited?: boolean;
}

/** Usuário técnico dos jobs (não é um id de `users`). */
export const SYSTEM_USER = 'system';

/** Empresa e usuário da requisição atual (AsyncLocalStorage via nestjs-cls). */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService<TenantStore>) {}

  /** Chamado após a autenticação (JwtStrategy). */
  set(companyId: string, userId: string): void {
    this.cls.set('companyId', companyId);
    this.cls.set('userId', userId);
  }

  /** Chamado ao abrir o contexto da requisição (middleware do CLS) ou do job. */
  setRequestMeta(meta: { requestId?: string | undefined; ip?: string | undefined }): void {
    if (meta.requestId) this.cls.set('requestId', meta.requestId);
    if (meta.ip) this.cls.set('ip', meta.ip);
  }

  get companyId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('companyId') : undefined;
  }

  get userId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('userId') : undefined;
  }

  get requestId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('requestId') : undefined;
  }

  get ip(): string | undefined {
    return this.cls.isActive() ? this.cls.get('ip') : undefined;
  }

  /** Auditoria explícita já registrada nesta execução? */
  get audited(): boolean {
    return this.cls.isActive() ? this.cls.get('audited') === true : false;
  }

  markAudited(): void {
    if (this.cls.isActive()) this.cls.set('audited', true);
  }

  /** Falha fechado: sem empresa no contexto, nenhuma consulta de negócio é executada. */
  requireCompanyId(): string {
    const companyId = this.companyId;
    if (!companyId) {
      throw new Error('Tenant context is missing: no company bound to the current execution');
    }
    return companyId;
  }

  /** Usuário autor da operação (movimentações, anexos, auditoria). */
  requireUserId(): string {
    const userId = this.userId;
    if (!userId) {
      throw new Error('Tenant context is missing: no user bound to the current execution');
    }
    return userId;
  }

  /**
   * Executa `fn` como se fosse uma requisição da empresa (jobs, seeds e testes).
   * `requestId` identifica a execução nos logs e na auditoria (ex.: `job:expiry-alert`).
   */
  runAs<T>(
    companyId: string,
    fn: () => Promise<T>,
    userId = SYSTEM_USER,
    requestId?: string,
  ): Promise<T> {
    return this.cls.run(async () => {
      this.set(companyId, userId);
      this.setRequestMeta({ requestId });
      // `await` aqui dentro é obrigatório: consultas do Prisma são lazy (só executam no `.then`).
      // Devolver a promise sem esperar faria a consulta rodar fora do contexto — e ser recusada.
      return await fn();
    });
  }
}
