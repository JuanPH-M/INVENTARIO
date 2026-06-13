import { Test, TestingModule } from '@nestjs/testing';
import { GetUsersUseCase } from './get-users.use-case';
import { PrismaService } from '../../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockUsers = [
  { id: 'u-1', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith', status: 'active', userRoles: [] },
  { id: 'u-2', email: 'bob@test.com', firstName: 'Bob', lastName: 'Jones', status: 'active', userRoles: [] },
];

describe('GetUsersUseCase', () => {
  let useCase: GetUsersUseCase;
  let prisma: { user: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(mockUsers),
        findFirst: jest.fn().mockResolvedValue(mockUsers[0]),
        count: jest.fn().mockResolvedValue(2),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUsersUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(GetUsersUseCase);
  });

  describe('execute', () => {
    it('returns paginated list with default page/limit', async () => {
      const result = await useCase.execute(TENANT_ID, {});
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_ID }),
        }),
      );
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('applies search filter on email/firstName/lastName', async () => {
      await useCase.execute(TENANT_ID, { search: 'alice' });

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR.some((c: Record<string,unknown>) => 'email' in c)).toBe(true);
    });

    it('applies status filter', async () => {
      await useCase.execute(TENANT_ID, { status: 'suspended' });

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('suspended');
    });

    it('applies branchId filter via userRoles.some', async () => {
      await useCase.execute(TENANT_ID, { branchId: 'branch-1' });

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.userRoles).toBeDefined();
    });

    it('applies roleSlug filter via userRoles.some', async () => {
      await useCase.execute(TENANT_ID, { roleSlug: 'manager' });

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.userRoles).toBeDefined();
    });

    it('paginates with page and limit parameters', async () => {
      await useCase.execute(TENANT_ID, { page: 2, limit: 5 });

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.skip).toBe(5);
      expect(call.take).toBe(5);
    });

    it('returns correct pagination meta', async () => {
      prisma.user.count.mockResolvedValue(25);
      const result = await useCase.execute(TENANT_ID, { page: 2, limit: 10 });

      expect(result.meta.total).toBe(25);
      expect(result.meta.page).toBe(2);
    });
  });

  describe('getById', () => {
    it('returns user detail for valid user', async () => {
      const result = await useCase.getById('u-1', TENANT_ID);

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'u-1', tenantId: TENANT_ID }),
        }),
      );
      expect(result).toMatchObject({ id: 'u-1' });
    });

    it('returns null when user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const result = await useCase.getById('nonexistent', TENANT_ID);
      expect(result).toBeNull();
    });

    it('excludes deleted users (deletedAt: null in query)', async () => {
      await useCase.getById('u-1', TENANT_ID);

      const call = prisma.user.findFirst.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
    });
  });
});
