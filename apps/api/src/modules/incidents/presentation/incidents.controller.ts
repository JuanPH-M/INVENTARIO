import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
@UseGuards(PermissionsGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Evita asociar la incidencia a sedes o usuarios de otra empresa. */
  private async assertOwnership(tenantId: string, branchId?: string, assignedToId?: string) {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
      if (!branch) throw new BadRequestException('La sede no existe');
    }
    if (assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: assignedToId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!assignee) throw new BadRequestException('El usuario asignado no existe');
    }
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INCIDENTS_READ)
  @ApiOperation({ summary: 'Listar incidencias' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit ?? 20);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      // Acepta varios estados separados por coma (ej. "open,in_progress")
      ...(status ? (status.includes(',') ? { status: { in: status.split(',') } } : { status }) : {}),
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(branchId ? { branchId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { ticketNumber: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
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
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        comments: { orderBy: { createdAt: 'asc' } },
        branch: { select: { name: true } },
        reportedBy: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    if (!incident) throw new NotFoundException();
    const authorIds = [...new Set(incident.comments.map((c) => c.createdById))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds }, tenantId: user.tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(authors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
    return {
      ...incident,
      comments: incident.comments.map((c) => ({ ...c, author: byId.get(c.createdById) ?? 'Usuario' })),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INCIDENTS_CREATE)
  @ApiOperation({ summary: 'Reportar incidencia' })
  async create(@Body() dto: CreateIncidentDto, @CurrentUser() user: JwtPayload) {
    await this.assertOwnership(user.tenantId, dto.branchId, dto.assignedToId);
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
    const i = await this.prisma.incident.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!i) throw new NotFoundException();
    await this.assertOwnership(user.tenantId, undefined, dto.assignedToId);
    const closing = (dto.status === 'resolved' || dto.status === 'closed') && !i.resolvedAt;
    const reopening = dto.status === 'open' || dto.status === 'in_progress';
    return this.prisma.incident.update({
      where: { id },
      data: {
        ...dto,
        ...(closing ? { resolvedAt: new Date() } : {}),
        ...(reopening ? { resolvedAt: null } : {}),
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
    const i = await this.prisma.incident.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!i) throw new NotFoundException();
    return this.prisma.incidentComment.create({ data: { incidentId: id, content: dto.content, createdById: user.sub } });
  }
}
