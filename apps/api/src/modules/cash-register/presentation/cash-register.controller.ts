import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { CashRegisterUseCase } from '../application/use-cases/cash-register.use-case';
import { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '@inventario/types';

class CreateCashRegisterDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() code!: string;
  @ApiProperty() @IsUUID() branchId!: string;
}

class OpenSessionDto {
  @ApiProperty() @IsUUID() cashRegisterId!: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) openingAmount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

class CloseSessionDto {
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) actualAmount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

class AddMovementDto {
  @ApiProperty({ enum: ['income', 'expense', 'withdrawal', 'deposit'] })
  // Ventas, devoluciones, apertura y cierre los registra el sistema: no se aceptan manualmente
  @IsEnum(['income', 'expense', 'withdrawal', 'deposit']) type!: string;
  @ApiProperty() @IsNumber() @Min(0.01) @Type(() => Number) amount!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) description!: string;
}

@ApiTags('Caja Registradora')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('cash-register')
export class CashRegisterController {
  constructor(
    private readonly cashRegisterUseCase: CashRegisterUseCase,
    private readonly prisma: PrismaService,
  ) {}

  /** Un usuario asignado a una sede solo opera las sesiones de su sede. */
  private async assertSessionScope(sessionId: string, user: JwtPayload) {
    if (!user.branchId) return;
    const session = await this.prisma.cashRegisterSession.findFirst({
      where: { id: sessionId, tenantId: user.tenantId },
      select: { branchId: true },
    });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada');
    if (session.branchId !== user.branchId) throw new ForbiddenException('Solo puedes operar cajas de tu propia sede');
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_MANAGE)
  @ApiOperation({ summary: 'Crear caja registradora' })
  async createRegister(
    @Body() dto: CreateCashRegisterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('La sede no existe');
    return this.cashRegisterUseCase.createRegister(user.tenantId, dto.branchId, dto.name.trim(), dto.code.trim().toUpperCase());
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_READ)
  @ApiOperation({ summary: 'Listar cajas registradoras' })
  async getRegisters(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
  ) {
    // Branch-scoped users can only see their own branch's registers
    const effectiveBranchId = user.branchId ?? branchId;
    return this.cashRegisterUseCase.getRegisters(user.tenantId, effectiveBranchId);
  }

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_READ)
  @ApiOperation({ summary: 'Historial de sesiones de caja' })
  async getSessionHistory(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // Branch-scoped users can only see their own branch's session history
    const effectiveBranchId = user.branchId ?? branchId;
    return this.cashRegisterUseCase.getSessionHistory(user.tenantId, effectiveBranchId, page, limit);
  }

  @Get(':registerId/session/current')
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_READ)
  @ApiOperation({ summary: 'Obtener sesión activa de una caja' })
  async getCurrentSession(
    @Param('registerId', ParseUUIDPipe) registerId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    // Verify the register belongs to user's branch (if branch-scoped)
    if (user.branchId) {
      const register = await this.prisma.cashRegister.findFirst({
        where: { id: registerId, tenantId: user.tenantId },
        select: { branchId: true },
      });
      if (!register) throw new NotFoundException('Caja no encontrada');
      if (register.branchId !== user.branchId) throw new ForbiddenException('Solo puedes consultar cajas de tu propia sucursal');
    }
    return this.cashRegisterUseCase.getOpenSession(registerId, user.tenantId);
  }

  @Post('sessions/open')
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_OPEN)
  @ApiOperation({ summary: 'Abrir sesión de caja' })
  async openSession(
    @Body() dto: OpenSessionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const branchId = user.branchId ?? (
      await this.prisma.cashRegister.findFirst({
        where: { id: dto.cashRegisterId, tenantId: user.tenantId },
        select: { branchId: true },
      })
    )?.branchId;

    if (!branchId) throw new BadRequestException('No se pudo determinar la sucursal de la caja');

    return this.cashRegisterUseCase.openSession(
      dto.cashRegisterId,
      user.tenantId,
      branchId,
      dto.openingAmount,
      user.sub,
      dto.notes,
    );
  }

  @Post('sessions/:sessionId/close')
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_CLOSE)
  @ApiOperation({ summary: 'Cerrar sesión de caja' })
  async closeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertSessionScope(sessionId, user);
    return this.cashRegisterUseCase.closeSession(
      sessionId,
      user.tenantId,
      dto.actualAmount,
      user.sub,
      dto.notes,
    );
  }

  @Post('sessions/:sessionId/movements')
  @RequirePermissions(PERMISSIONS.CASH_REGISTER_MOVEMENTS)
  @ApiOperation({ summary: 'Registrar movimiento en caja (ingreso, gasto, retiro, depósito)' })
  async addMovement(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: AddMovementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertSessionScope(sessionId, user);
    return this.cashRegisterUseCase.addMovement(
      sessionId,
      user.tenantId,
      dto.type,
      dto.amount,
      dto.description,
      user.sub,
    );
  }
}
