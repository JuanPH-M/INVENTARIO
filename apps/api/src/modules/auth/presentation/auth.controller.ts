import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { MfaUseCase } from '../application/use-cases/mfa.use-case';
import { ForgotPasswordUseCase } from '../application/use-cases/forgot-password.use-case';
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { UpdateProfileUseCase } from '../application/use-cases/update-profile.use-case';
import { GetProfileUseCase } from '../application/use-cases/get-profile.use-case';
import {
  ChangePasswordDto,
  DisableMfaDto,
  EnableMfaDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyMfaDto,
} from '../application/dtos/login.dto';
import type { JwtPayload, TokenResponse } from '@inventario/types';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly mfaUseCase: MfaUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly getProfileUseCase: GetProfileUseCase,
  ) {}

  /**
   * El refresh token viaja solo en una cookie HttpOnly (nunca accesible desde JS).
   * `secure` se activa cuando la petición llega por HTTPS (o COOKIE_SECURE=true),
   * lo que permite instalaciones en red local por HTTP sin romper el inicio de sesión.
   */
  private setRefreshCookie(req: Request, res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: req.secure || process.env['COOKIE_SECURE'] === 'true',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.loginUseCase.refreshTokenTtlMs,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    // Cookies emitidas por versiones anteriores usaban path "/"
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  }

  private publicTokens(tokens: TokenResponse) {
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, tokenType: tokens.tokenType };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginUseCase.execute(dto, ip, userAgent ?? '');
    if (result.type === 'mfa_required') {
      return { requiresMfa: true, mfaToken: result.mfaToken };
    }
    this.setRefreshCookie(req, res, result.data.refreshToken);
    return this.publicTokens(result.data);
  }

  @Public()
  @SkipThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar el access token usando la cookie de sesión' })
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshCookie(req);
    if (!refreshToken) throw new UnauthorizedException('No hay sesión activa');
    try {
      const tokens = await this.refreshTokenUseCase.execute(refreshToken, ip, userAgent ?? '');
      this.setRefreshCookie(req, res, tokens.refreshToken);
      return this.publicTokens(tokens);
    } catch (err) {
      if (!(err instanceof UnauthorizedException && err.message === 'Sesión ya renovada')) {
        this.clearRefreshCookie(res);
      }
      throw err;
    }
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.logoutUseCase.execute(user.sub, user.sessionId, this.readRefreshCookie(req));
    this.clearRefreshCookie(res);
  }

  @Post('logout/all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión en todos los dispositivos' })
  async logoutAll(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    await this.logoutUseCase.revokeAllSessions(user.sub);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @SkipThrottle()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado con sus permisos efectivos' })
  async me(@CurrentUser() user: JwtPayload) {
    return this.getProfileUseCase.execute(user.sub, user.tenantId, user.branchId ?? null);
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar configuración de MFA — obtener QR y secreto' })
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return this.mfaUseCase.setupMfa(user.sub, user.tenantId);
  }

  @Post('mfa/enable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirmar y habilitar MFA con código TOTP' })
  async enableMfa(@CurrentUser() user: JwtPayload, @Body() dto: EnableMfaDto) {
    await this.mfaUseCase.enableMfa(user.sub, user.tenantId, dto.code);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  @ApiOperation({ summary: 'Verificar código MFA durante el login' })
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.mfaUseCase.verifyMfaAndLogin(dto.mfaToken, dto.code, ip, userAgent ?? '');
    this.setRefreshCookie(req, res, tokens.refreshToken);
    return this.publicTokens(tokens);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deshabilitar MFA (requiere código y contraseña)' })
  async disableMfa(@CurrentUser() user: JwtPayload, @Body() dto: DisableMfaDto) {
    await this.mfaUseCase.disableMfa(user.sub, user.tenantId, dto.code, dto.password);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Solicitar enlace de restablecimiento de contraseña' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.forgotPasswordUseCase.requestReset(dto.email);
    return { message: 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Restablecer contraseña con el token recibido por correo' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.forgotPasswordUseCase.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambiar contraseña (cierra las demás sesiones)' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.changePasswordUseCase.execute(user.sub, dto.currentPassword, dto.newPassword);
    this.clearRefreshCookie(res);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar perfil del usuario autenticado' })
  async updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    await this.updateProfileUseCase.execute(user.sub, dto);
    return this.getProfileUseCase.execute(user.sub, user.tenantId, user.branchId ?? null);
  }
}
