import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role as AppRole } from '@traceflow/shared';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Rota acessível sem token (health, emissor simulado). Todo o resto exige autenticação. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe a rota a usuários com pelo menos um destes perfis. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injeta o usuário autenticado no handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);
