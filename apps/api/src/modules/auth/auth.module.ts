import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { MfaUseCase } from './application/use-cases/mfa.use-case';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const privateKey = config.get<string>('jwt.privateKey');
        const publicKey = config.get<string>('jwt.publicKey');
        const expiresIn = (config.get<string>('jwt.expiresIn') ?? '15m') as `${number}${'s'|'m'|'h'|'d'}`;
        const env = config.get<string>('app.nodeEnv') ?? 'development';
        if (privateKey && publicKey) {
          return { privateKey, publicKey, signOptions: { algorithm: 'RS256' as const, expiresIn } };
        }
        if (env !== 'development' && env !== 'test') {
          throw new Error('JWT_PRIVATE_KEY y JWT_PUBLIC_KEY son requeridas en producción');
        }
        return { secret: config.get<string>('jwt.refreshTokenSecret') ?? 'dev-secret', signOptions: { expiresIn } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    LogoutUseCase,
    RefreshTokenUseCase,
    MfaUseCase,
    ForgotPasswordUseCase,
    ChangePasswordUseCase,
    UpdateProfileUseCase,
    JwtStrategy,
  ],
  exports: [LoginUseCase, JwtModule, PassportModule],
})
export class AuthModule {}
