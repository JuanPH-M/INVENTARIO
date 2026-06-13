import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { GetUsersUseCase } from '../application/use-cases/get-users.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import {
  CreateUserDto,
  UpdateUserDto,
  AssignRoleDto,
  RemoveRoleDto,
  OverridePermissionDto,
  GetUsersQueryDto,
} from '../application/dtos/user.dto';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUsers: GetUsersUseCase,
    private readonly updateUser: UpdateUserUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Listar usuarios de la empresa' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetUsersQueryDto,
  ) {
    return this.getUsers.execute(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getUsers.getById(id, user.tenantId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @ApiOperation({ summary: 'Crear usuario' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.createUser.execute(dto, user.tenantId, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @ApiOperation({ summary: 'Actualizar usuario' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.updateUser.update(id, user.tenantId, dto);
  }

  @Patch(':id/suspend')
  @RequirePermissions(PERMISSIONS.USERS_SUSPEND)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Suspender usuario' })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.updateUser.suspend(id, user.tenantId);
  }

  @Patch(':id/activate')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Activar usuario' })
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.updateUser.activate(id, user.tenantId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar usuario (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.updateUser.delete(id, user.tenantId, user.sub);
  }

  @Post(':id/roles')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Asignar rol a usuario' })
  async assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.updateUser.assignRole(id, user.tenantId, dto, user);
  }

  @Delete(':id/roles')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover rol de usuario' })
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.updateUser.removeRole(id, user.tenantId, dto);
  }

  @Post(':id/permissions')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sobreescribir permiso individual de usuario' })
  async overridePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverridePermissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.updateUser.overridePermission(id, user.tenantId, dto, user);
  }
}
