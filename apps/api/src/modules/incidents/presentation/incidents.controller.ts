import {
  Body, Controller, Get, HttpCode, HttpStatus,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

class CreateIncidentDto {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() description!: string;
  @ApiProperty({ enum: ['theft','damage','accident','complaint','equipment_failure','security','other'] })
  @IsEnum(['theft','damage','accident','complaint','equipment_failure','security','other']) type!: string;
  @ApiPropertyOptional({ enum: ['low','medium','high','critical'] })
  @IsOptional() @IsEnum(['low','medium','high','critical']) severity?: string;
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
}
class UpdateIncidentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() resolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) resolutionCost?: number;
  @ApiPropertyOptional({ enum: ['open','in_progress','resolved','closed'] })
  @IsOptional() @IsEnum(['open','in_progress','resolved','closed']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
}
class AddCommentDto {
  @ApiProperty() @IsString() @IsNotEmpty() content!: string;
}

@ApiTags('Incidencias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  @ApiOperation({ summary: 'Listar incidencias' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('branchId') branchId?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, 20);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(branchId ? { branchId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({
        where, skip, take: l, orderBy: { occurredAt: 'desc' },
        include: {
          branch: { select: { name: true } },
          reportedBy: { select: { firstName: true, lastName: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.incident.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  @ApiOperation({ summary: 'Obtener incidencia' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        comments: { orderBy: { createdAt: 'asc' } },
        reportedBy: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    if (!incident) throw new NotFoundException();
    return incident;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INCIDENTS_CREATE)
  @ApiOperation({ summary: 'Reportar incidencia' })
  async create(@Body() dto: CreateIncidentDto, @CurrentUser() user: JwtPayload) {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.prisma.incident.count({ where: { tenantId: user.tenantId } });
      const ticketNumber = `INC${year}-${String(count + attempt + 1).padStart(5, '0')}`;
      try {
        return await this.prisma.incident.create({
          data: {
            tenantId: user.tenantId,
            branchId: dto.branchId,
            ticketNumber,
            title: dto.title,
            description: dto.description,
            type: dto.type,
            severity: dto.severity ?? 'medium',
            status: 'open',
            reportedById: user.sub,
            assignedToId: dto.assignedToId,
            occurredAt: new Date(dto.occurredAt),
          },
        });
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INCIDENTS_UPDATE)
  @ApiOperation({ summary: 'Actualizar incidencia' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const i = await this.prisma.incident.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!i) throw new NotFoundException();
    return this.prisma.incident.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.status === 'resolved' || dto.status === 'closed' ? { resolvedAt: new Date() } : {}),
      },
    });
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.INCIDENTS_UPDATE)
  @ApiOperation({ summary: 'Agregar comentario a incidencia' })
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const i = await this.prisma.incident.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!i) throw new NotFoundException();
    return this.prisma.incidentComment.create({ data: { incidentId: id, content: dto.content, createdById: user.sub } });
  }
}
