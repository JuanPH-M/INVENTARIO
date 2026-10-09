import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionResolverService } from '../access/permission-resolver.service';
import type { JwtPayload } from '@inventario/types';
import type { Request } from 'express';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const granted = await this.resolver.getPermissions(user.sub, user.branchId ?? null);
    const missing = required.filter((perm) => !granted.includes(perm));
    if (missing.length > 0) {
      throw new ForbiddenException(`Permisos insuficientes. Requeridos: ${missing.join(', ')}`);
    }
    return true;
  }
}
