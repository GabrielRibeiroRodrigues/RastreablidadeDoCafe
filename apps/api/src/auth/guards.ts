import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Role as AppRole } from '@traceflow/shared';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';

const isPublic = (reflector: Reflector, context: ExecutionContext): boolean =>
  reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]) === true;

/** Guard global: toda rota exige um access token válido, exceto as marcadas com @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    return isPublic(this.reflector, context) || super.canActivate(context);
  }

  override handleRequest<TUser = AuthUser>(err: unknown, user: TUser | false): TUser {
    if (err instanceof UnauthorizedException) throw err;
    if (err || !user) throw new UnauthorizedException('Missing or invalid access token');
    return user;
  }
}

/** Guard global: aplica @Roles(...). Sem @Roles, basta estar autenticado. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublic(this.reflector, context)) return true;

    const required = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (user?.roles.some((role) => required.includes(role))) return true;

    throw new ForbiddenException('Your profile is not allowed to perform this action');
  }
}
