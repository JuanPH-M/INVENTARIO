import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  Req,
  Res,
  Headers,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { MfaUseCase } from '../application/use-cases/mfa.use-case';
import { ForgotPasswordUseCase } from '../application/use-cases/forgot-password.use-case';
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { UpdateProfileUseCase } from '../application/use-cases/update-profile.use-case';
import {
  LoginDto,
  RefreshTokenDto,
  VerifyMfaDto,
  EnableMfaDto,
  DisableMfaDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateProfileDto,
} from '../application/dtos/login.dto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  private readonly isDev: boolean;

  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly mfaUseCase: MfaUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.isDev = (this.config.get<string>('app.nodeEnv') ?? 'development') !== 'production';
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginUseCase.execute(dto, ip, userAgent ?? '');
    if (result.type === 'mfa_required') {
      return { requiresMfa: true, mfaToken: result.mfaToken };
    }
    res.cookie('refresh_token', result.data.refreshToken, {
      httpOnly: true,
      secure: !this.isDev,
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    return { accessToken: result.data.accessToken, expiresIn: result.data.expiresIn, tokenType: result.data.tokenType };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token con refresh token' })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string>)['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token no encontrado en cookie');
    }
    const tokens = await this.refreshTokenUseCase.execute(refreshToken, ip, userAgent ?? '');
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: !this.isDev,
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, tokenType: tokens.tokenType };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { refreshToken?: string },
  ) {
    await this.logoutUseCase.execute(user.sub, user.sessionId, body.refreshToken);
  }

  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar todas las sesiones' })
  async logoutAll(@CurrentUser() user: JwtPayload) {
    await this.logoutUseCase.revokeAllSessions(user.sub);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener usuario autenticado' })
  async me(@CurrentUser() user: JwtPayload) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.sub },
      include: {
        tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: { select: { slug: true } } },
                },
              },
            },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!dbUser) return null;

    const permissions = [
      ...new Set(
        dbUser.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp: { permission: { slug: string } }) => rp.permission.slug),
        ),
      ),
    ];

    const primaryRole = dbUser.userRoles[0]?.role.slug ?? 'employee';
    const roles = [...new Set(dbUser.userRoles.map((ur) => ur.role.slug))];

    return {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      avatarUrl: dbUser.avatarUrl,
      status: dbUser.status,
      mfaEnabled: dbUser.mfaEnabled,
      language: dbUser.language,
      timezone: dbUser.timezone,
      lastLoginAt: dbUser.lastLoginAt,
      tenantId: dbUser.tenantId,
      role: primaryRole,
      roles,
      permissions,
      tenant: dbUser.tenant,
      userRoles: dbUser.userRoles.map((ur) => ({
        roleId: ur.roleId,
        roleName: ur.role.name,
        roleSlug: ur.role.slug,
        branchId: ur.branchId,
        branchName: ur.branch?.name ?? null,
      })),
    };
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar configuración de MFA — obtener QR y secreto' })
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return this.mfaUseCase.setupMfa(user.sub, user.tenantId);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirmar y habilitar MFA con código TOTP' })
  async enableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EnableMfaDto,
  ) {
    await this.mfaUseCase.enableMfa(user.sub, user.tenantId, dto.code);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar código MFA durante login' })
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.mfaUseCase.verifyMfaAndLogin(dto.mfaToken, dto.code, ip, userAgent ?? '');
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: !this.isDev,
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, tokenType: tokens.tokenType };
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deshabilitar MFA (requiere código y contraseña)' })
  async disableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DisableMfaDto,
  ) {
    await this.mfaUseCase.disableMfa(user.sub, user.tenantId, dto.code, dto.password);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  @ApiOperation({ summary: 'Solicitar restablecimiento de contraseña' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.forgotPasswordUseCase.requestReset(dto.email);
    return { message: 'Si el email existe, recibirás las instrucciones' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.forgotPasswordUseCase.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambiar contraseña (usuario autenticado)' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.changePasswordUseCase.execute(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar perfil del usuario autenticado' })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    await this.updateProfileUseCase.execute(user.sub, dto);
  }
}
