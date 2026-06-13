import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../../database/prisma.service';
import type { JwtPayload } from '@inventario/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKey = config.get<string>('jwt.publicKey');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey ?? 'fallback-dev-secret',
      algorithms: publicKey ? ['RS256'] : ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId },
      select: { id: true, status: true, tenant: { select: { status: true } } },
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (user.status !== 'active') {
      throw new UnauthorizedException(`Cuenta ${user.status}`);
    }
    if (user.tenant.status !== 'active') {
      throw new UnauthorizedException('Empresa suspendida o cancelada');
    }

    return payload;
  }
}
