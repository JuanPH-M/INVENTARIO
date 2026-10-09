import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UpdateUserUseCase } from './update-user.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  argon2id: 2,
}));

const USER_ID = 'user-1';
const TENANT_ID = 'tenant-1';
const REQUESTER_ID = 'requester-1';

const activeUser = { id: USER_ID, status: 'active' };

function makeRequester(roles: string[] = ['admin_general']) {
  return {
    sub: REQUESTER_ID,
    tenantId: TENANT_ID,
    roles,
    email: 'requester@test.com',
    branchId: null,
    sessionId: 'session-1',
  };
}

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    role: { findFirst: jest.Mock };
    userRole: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
    branch: { count: jest.Mock };
    permission: { findUnique: jest.Mock };
    userPermission: { upsert: jest.Mock };
  };
  let cacheService: { invalidatePattern: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(activeUser),
        update: jest.fn().mockResolvedValue({ ...activeUser, email: 'test@test.com' }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      role: { findFirst: jest.fn() },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      branch: { count: jest.fn().mockResolvedValue(1) },
      permission: { findUnique: jest.fn() },
      userPermission: { upsert: jest.fn().mockResolvedValue({}) },
    };
    cacheService = {
      invalidatePattern: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateUserUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    useCase = module.get(UpdateUserUseCase);
  });

  describe('update', () => {
    it('updates user fields', async () => {
      const dto = { firstName: 'Carlos' };
      await useCase.update(USER_ID, TENANT_ID, dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID } }),
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalled();
    });

    it('hashes password when password field is provided', async () => {
      const argon2 = jest.requireMock('argon2');
      await useCase.update(USER_ID, TENANT_ID, { password: 'NewPass123!' } as never);

      expect(argon2.hash).toHaveBeenCalledWith('NewPass123!', expect.any(Object));
      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.passwordHash).toBe('hashed-password');
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(useCase.update(USER_ID, TENANT_ID, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspend', () => {
    it('suspends user and revokes refresh tokens', async () => {
      await useCase.suspend(USER_ID, TENANT_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'suspended' } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, revokedAt: null }),
        }),
      );
    });

    it('is a no-op when user is already suspended', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: USER_ID, status: 'suspended' });

      await useCase.suspend(USER_ID, TENANT_ID);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(useCase.suspend(USER_ID, TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('activate', () => {
    it('activates user and resets login attempts', async () => {
      await useCase.activate(USER_ID, TENANT_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'active', failedLoginAttempts: 0, lockedUntil: null },
        }),
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('soft-deletes user', async () => {
      await useCase.delete(USER_ID, TENANT_ID, REQUESTER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date), status: 'suspended' }),
        }),
      );
    });

    it('throws ForbiddenException when user tries to delete themselves', async () => {
      await expect(useCase.delete(USER_ID, TENANT_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assignRole', () => {
    it('creates the role assignment (global when no branch is given)', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', slug: 'manager', name: 'Gerente' });

      await useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-1' }, makeRequester());

      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: USER_ID, roleId: 'role-1', branchId: null }),
      });
      expect(cacheService.invalidatePattern).toHaveBeenCalled();
    });

    it('updates the expiry when the assignment already exists', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', slug: 'manager', name: 'Gerente' });
      prisma.userRole.findFirst.mockResolvedValue({ id: 'ur-1' });

      await useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-1', branchId: 'b-1' }, makeRequester());

      expect(prisma.userRole.update).toHaveBeenCalledWith({ where: { id: 'ur-1' }, data: { expiresAt: null } });
      expect(prisma.userRole.create).not.toHaveBeenCalled();
    });

    it('rejects a branch from another company', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', slug: 'manager', name: 'Gerente' });
      prisma.branch.count.mockResolvedValue(0);

      await expect(
        useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-1', branchId: 'foreign' }, makeRequester()),
      ).rejects.toThrow('La sucursal no existe');
    });

    it('lets a company admin grant the admin role but not super admin', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-ag', slug: 'admin_general', name: 'Admin' });
      await expect(
        useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-ag' }, makeRequester(['admin_general'])),
      ).resolves.not.toThrow();

      prisma.role.findFirst.mockResolvedValue({ id: 'role-ag', slug: 'admin_general', name: 'Admin' });
      await expect(
        useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-ag' }, makeRequester(['supervisor'])),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      prisma.role.findFirst.mockResolvedValue(null);

      await expect(
        useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'ghost' }, makeRequester()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-super_admin tries to assign super_admin role', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-sa', slug: 'super_admin' });

      await expect(
        useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-sa' }, makeRequester(['admin_general'])),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows super_admin to assign super_admin role', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-sa', slug: 'super_admin' });

      await expect(
        useCase.assignRole(USER_ID, TENANT_ID, { roleId: 'role-sa' }, makeRequester(['super_admin'])),
      ).resolves.not.toThrow();
    });
  });

  describe('removeRole', () => {
    it('removes the user role', async () => {
      await useCase.removeRole(USER_ID, TENANT_ID, { roleId: 'role-1' });

      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) }),
      );
    });
  });
});
