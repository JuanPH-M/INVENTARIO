import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import type { JwtPayload } from '@inventario/types';

type UserState = { status: string; tenantStatus: string; deleted: boolean };

/** Tiempo que se cachea el estado del usuario para no consultar la BD en cada petición. */
const USER_STATE_TTL_SECONDS = 30;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    const publicKey = config.get<string>('jwt.publicKey');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Debe coincidir con la configuración de firma de JwtModule (auth.module.ts)
      secretOrKey: publicKey || (config.get<string>('jwt.devSecret') as string),
      algorithms: publicKey ? ['RS256'] : ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const key = `userstate:${payload.sub}`;
    let state = await this.cache.get<UserState>(key);

    if (!state) {
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, tenantId: payload.tenantId },
        select: { status: true, deletedAt: true, tenant: { select: { status: true } } },
      });
      if (!user) throw new UnauthorizedException('Usuario no encontrado');
      state = { status: user.status, tenantStatus: user.tenant.status, deleted: !!user.deletedAt };
      await this.cache.set(key, state, USER_STATE_TTL_SECONDS);
    }

    if (state.deleted) throw new UnauthorizedException('Usuario eliminado');
    if (state.status !== 'active') throw new UnauthorizedException('Cuenta inactiva o bloqueada');
    if (state.tenantStatus !== 'active') throw new UnauthorizedException('Empresa suspendida');

    return payload;
  }
}
