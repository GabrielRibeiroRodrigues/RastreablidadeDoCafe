import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Role as AppRole } from '@traceflow/shared';
import { toAppRole, type AuthUser } from '../../auth/auth-user.js';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import {
  orderBy,
  pageArgs,
  statusFilter,
  toPage,
  type Page,
} from '../../common/http/pagination.js';
import { Prisma, Role, type User } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { USER_DIRECTORY, type UserDirectory } from './user-directory.js';
import type { InviteUserDto, ListUsersQueryDto, UpdateUserDto, UserResponse } from './users.dto.js';

const APP_TO_DB_ROLE: Record<AppRole, Role> = {
  admin: Role.ADMIN,
  operator: Role.OPERATOR,
  auditor: Role.AUDITOR,
};

const lastAdmin = () =>
  new DomainProblemException(
    '/problems/last-admin',
    'The company must keep at least one active admin.',
    HttpStatus.CONFLICT,
  );

/**
 * Usuários da empresa (só admin). O perfil no banco é a fonte de verdade da autorização
 * (ADR 0012): mudar o perfil ou desativar vale na próxima requisição, sem esperar o token expirar.
 * O diretório (Cognito) é atualizado dentro da mesma transação: se ele falhar, nada muda no banco.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    @Inject(USER_DIRECTORY) private readonly directory: UserDirectory,
  ) {}

  async list(query: ListUsersQueryDto, current: AuthUser): Promise<Page<UserResponse>> {
    const where: Prisma.UserWhereInput = {
      ...statusFilter(query.status),
      ...(query.role && { role: APP_TO_DB_ROLE[query.role] }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.db.client.user.findMany({
        where,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
      }),
      this.db.client.user.count({ where }),
    ]);
    return toPage(
      rows.map((row) => toResponse(row, current)),
      total,
      query,
    );
  }

  async get(id: string, current: AuthUser): Promise<UserResponse> {
    return toResponse(await this.db.client.user.findUniqueOrThrow({ where: { id } }), current);
  }

  async invite(dto: InviteUserDto, current: AuthUser): Promise<UserResponse> {
    // E-mail de login é único entre empresas: o Cognito (username) e o índice único do banco
    // recusam duplicados; os dois viram 409 com o erro no campo `email`.
    const user = await this.db.transaction(async (tx) => {
      const cognitoSub = await this.directory.invite(dto.email, dto.name, dto.role);
      const created = await tx.user.create({
        data: {
          cognitoSub,
          email: dto.email,
          name: dto.name,
          role: APP_TO_DB_ROLE[dto.role],
        } as Prisma.UserUncheckedCreateInput,
      });
      await this.audit.record(
        {
          action: 'user.invited',
          entityType: 'user',
          entityId: created.id,
          after: { email: dto.email, name: dto.name, role: dto.role },
        },
        tx,
      );
      return created;
    });
    return toResponse(user, current);
  }

  async update(id: string, dto: UpdateUserDto, current: AuthUser): Promise<UserResponse> {
    const user = await this.db.transaction(async (tx) => {
      const before = await this.lockUser(tx, id);
      const role = dto.role ? APP_TO_DB_ROLE[dto.role] : before.role;

      if (role !== before.role) {
        if (before.id === current.id) {
          throw new DomainProblemException(
            '/problems/own-role',
            'You cannot change your own role.',
            HttpStatus.CONFLICT,
          );
        }
        if (before.role === Role.ADMIN && before.isActive) await this.assertOtherAdmin(tx, id);
        await this.directory.setRole(before.cognitoSub, toAppRole(role));
      }

      const updated = await tx.user.update({
        where: { id },
        data: { role, ...(dto.name && { name: dto.name }) },
      });
      await this.audit.record(
        {
          action: 'user.updated',
          entityType: 'user',
          entityId: id,
          before: { name: before.name, role: toAppRole(before.role) },
          after: { name: updated.name, role: toAppRole(updated.role) },
        },
        tx,
      );
      return updated;
    });
    return toResponse(user, current);
  }

  async setActive(id: string, isActive: boolean, current: AuthUser): Promise<UserResponse> {
    const user = await this.db.transaction(async (tx) => {
      const before = await this.lockUser(tx, id);
      if (before.isActive === isActive) return before;
      if (!isActive) {
        if (before.id === current.id) {
          throw new DomainProblemException(
            '/problems/own-account',
            'You cannot deactivate your own account.',
            HttpStatus.CONFLICT,
          );
        }
        if (before.role === Role.ADMIN) await this.assertOtherAdmin(tx, id);
        await this.directory.disable(before.cognitoSub);
      } else {
        await this.directory.enable(before.cognitoSub);
      }

      const updated = await tx.user.update({ where: { id }, data: { isActive } });
      await this.audit.record(
        {
          action: isActive ? 'user.activated' : 'user.deactivated',
          entityType: 'user',
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive, email: before.email },
        },
        tx,
      );
      return updated;
    });
    return toResponse(user, current);
  }

  private async lockUser(tx: TenantTransaction, id: string): Promise<User> {
    // Trava os admins ativos da empresa: dois admins rebaixando um ao outro ao mesmo tempo não
    // podem deixar a empresa sem nenhum.
    await tx.sql(
      (companyId) => Prisma.sql`
        SELECT id FROM users
        WHERE company_id = ${companyId}::uuid AND (role = 'ADMIN' OR id = ${id}::uuid)
        ORDER BY id
        FOR UPDATE`,
    );
    return tx.user.findUniqueOrThrow({ where: { id } });
  }

  private async assertOtherAdmin(tx: TenantTransaction, exceptId: string): Promise<void> {
    const others = await tx.user.count({
      where: { role: Role.ADMIN, isActive: true, id: { not: exceptId } },
    });
    if (others === 0) throw lastAdmin();
  }
}

function toResponse(user: User, current: AuthUser): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: toAppRole(user.role),
    isActive: user.isActive,
    isCurrentUser: user.id === current.id,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
