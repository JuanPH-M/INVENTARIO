import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CacheService } from '../../cache/cache.service';
import { CACHE_KEYS } from '../../cache/cache-keys.constant';
import type { JwtPayload } from '@inventario/types';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const result = await (super.canActivate(context) as Promise<boolean>);
    if (!result) return false;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const payload = request.user;

    if (payload?.sessionId) {
      const isBlacklisted = await this.cacheService.exists(
        CACHE_KEYS.TOKEN_BLACKLIST(payload.sessionId),
      );
      if (isBlacklisted) throw new UnauthorizedException('Sesión revocada');
    }

    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest(err: any, user: any): any {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Token inválido o expirado');
    }
    return user;
  }
}
