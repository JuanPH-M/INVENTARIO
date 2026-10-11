import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional,
  IsString, IsUUID, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

class CreateEventDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({
    enum: ['meeting','inventory_count','audit','maintenance','renewal','training','task','holiday','other'],
  })
  @IsEnum(['meeting','inventory_count','audit','maintenance','renewal','training','task','holiday','other'])
  type!: string;
  @ApiProperty() @IsDateString() startAt!: string;
  @ApiProperty() @IsDateString() endAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allDay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(7) color?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
}
class UpdateEventDto extends PartialType(CreateEventDto) {}

@ApiTags('Calendario')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('events')
  @RequirePermissions(PERMISSIONS.CALENDAR_READ)
  @ApiOperation({ summary: 'Listar eventos del calendario' })
  async getEvents(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.prisma.calendarEvent.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(type ? { type } : {}),
        ...(from || to ? {
          startAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      include: {
        attendees: true,
        branch: { select: { name: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  @Get('events/upcoming')
  @RequirePermissions(PERMISSIONS.CALENDAR_READ)
  @ApiOperation({ summary: 'Próximos eventos (30 días)' })
  async getUpcoming(@CurrentUser() user: JwtPayload) {
    const now = new Date();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.prisma.calendarEvent.findMany({
      where: { tenantId: user.tenantId, deletedAt: null, startAt: { gte: now, lte: future } },
      orderBy: { startAt: 'asc' },
      take: 20,
    });
  }

  @Post('events')
  @RequirePermissions(PERMISSIONS.CALENDAR_CREATE)
  @ApiOperation({ summary: 'Crear evento' })
  async create(@Body() dto: CreateEventDto, @CurrentUser() user: JwtPayload) {
    if (new Date(dto.endAt) < new Date(dto.startAt)) throw new BadRequestException('El fin debe ser posterior al inicio');
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId: user.tenantId } });
      if (!branch) throw new BadRequestException('La sede no existe');
    }
    return this.prisma.calendarEvent.create({
      data: {
        tenantId: user.tenantId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        allDay: dto.allDay ?? false,
        location: dto.location,
        color: dto.color,
        branchId: dto.branchId,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        createdById: user.sub,
      },
    });
  }

  @Patch('events/:id')
  @RequirePermissions(PERMISSIONS.CALENDAR_UPDATE)
  @ApiOperation({ summary: 'Actualizar evento' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const e = await this.prisma.calendarEvent.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!e) throw new NotFoundException();
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startAt ? { startAt: new Date(dto.startAt) } : {}),
        ...(dto.endAt ? { endAt: new Date(dto.endAt) } : {}),
      },
    });
  }

  @Delete('events/:id')
  @RequirePermissions(PERMISSIONS.CALENDAR_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar evento' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const e = await this.prisma.calendarEvent.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!e) throw new NotFoundException();
    await this.prisma.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
