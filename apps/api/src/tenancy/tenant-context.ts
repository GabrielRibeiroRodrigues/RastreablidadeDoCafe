import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';

export interface TenantStore extends ClsStore {
  companyId?: string;
  userId?: string;
}

/** Empresa e usuário da requisição atual (AsyncLocalStorage via nestjs-cls). */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService<TenantStore>) {}

  /** Chamado após a autenticação (JwtStrategy). */
  set(companyId: string, userId: string): void {
    this.cls.set('companyId', companyId);
    this.cls.set('userId', userId);
  }

  get companyId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('companyId') : undefined;
  }

  get userId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('userId') : undefined;
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

  /** Executa `fn` como se fosse uma requisição da empresa (jobs, seeds e testes). */
  runAs<T>(companyId: string, fn: () => Promise<T>, userId = 'system'): Promise<T> {
    return this.cls.run(async () => {
      this.set(companyId, userId);
      // `await` aqui dentro é obrigatório: consultas do Prisma são lazy (só executam no `.then`).
      // Devolver a promise sem esperar faria a consulta rodar fora do contexto — e ser recusada.
      return await fn();
    });
  }
}
