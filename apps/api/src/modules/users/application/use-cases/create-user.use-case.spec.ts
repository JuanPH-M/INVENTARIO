import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CreateUserUseCase } from './create-user.use-case';
import { PrismaService } from '../../../../database/prisma.service';

jest.mock('argon2');
const mockArgon2 = argon2 as jest.Mocked<typeof argon2>;

const TENANT_ID = 'tenant-1';
const CREATOR_ID = 'creator-1';
const ROLE_ID = 'role-1';

function makeDto(overrides = {}) {
  return {
    email: 'nuevo@test.com',
    password: 'SecurePass123!',
    firstName: 'Juan',
    lastName: 'Pérez',
    phone: '3001234567',
    roleId: ROLE_ID,
    ...overrides,
  };
}

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      tenant: { findFirst: jest.fn() },
      userRole: { create: jest.fn() },
    };

    (mockArgon2.hash as jest.Mock).mockResolvedValue('$argon2id$hashed');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateUserUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(CreateUserUseCase);
  });

  describe('execute — happy path', () => {
    beforeEach(() => {
      (prisma['user'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      (prisma['tenant'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({
        id: TENANT_ID,
        plan: { maxUsers: -1 },
      });
      (prisma['user'] as Record<string, jest.Mock>).count.mockResolvedValue(5);
      (prisma['user'] as Record<string, jest.Mock>).create.mockResolvedValue({
        id: 'new-user-1',
        email: 'nuevo@test.com',
        firstName: 'Juan',
        lastName: 'Pérez',
        status: 'active',
      });
      (prisma['userRole'] as Record<string, jest.Mock>).create.mockResolvedValue({});
    });

    it('creates user and assigns role', async () => {
      const result = await useCase.execute(makeDto(), TENANT_ID, CREATOR_ID);

      expect(result).toMatchObject({ email: 'nuevo@test.com' });
      expect((prisma['userRole'] as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roleId: ROLE_ID, assignedBy: CREATOR_ID }),
        }),
      );
    });

    it('lowercases the email', async () => {
      await useCase.execute(makeDto({ email: 'UPPER@TEST.COM' }), TENANT_ID, CREATOR_ID);

      expect((prisma['user'] as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'upper@test.com' }),
        }),
      );
    });

    it('trims whitespace from first and last name', async () => {
      await useCase.execute(makeDto({ firstName: '  Ana  ', lastName: '  García  ' }), TENANT_ID, CREATOR_ID);

      expect((prisma['user'] as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ firstName: 'Ana', lastName: 'García' }),
        }),
      );
    });

    it('sets default language and timezone', async () => {
      await useCase.execute(makeDto(), TENANT_ID, CREATOR_ID);

      expect((prisma['user'] as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ language: 'es', timezone: 'America/Bogota' }),
        }),
      );
    });

    it('hashes password with argon2id', async () => {
      await useCase.execute(makeDto(), TENANT_ID, CREATOR_ID);

      expect(mockArgon2.hash).toHaveBeenCalledWith('SecurePass123!', expect.objectContaining({
        type: argon2.argon2id,
      }));
    });

    it('sets emailVerifiedAt automatically', async () => {
      await useCase.execute(makeDto(), TENANT_ID, CREATOR_ID);

      expect((prisma['user'] as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('execute — validation errors', () => {
    it('throws ConflictException when email already exists in tenant', async () => {
      (prisma['user'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(useCase.execute(makeDto(), TENANT_ID, CREATOR_ID)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when tenant not found', async () => {
      (prisma['user'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      (prisma['tenant'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      (prisma['user'] as Record<string, jest.Mock>).count.mockResolvedValue(0);

      await expect(useCase.execute(makeDto(), TENANT_ID, CREATOR_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when plan user limit is reached', async () => {
      (prisma['user'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      (prisma['tenant'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({
        id: TENANT_ID,
        plan: { maxUsers: 3 },
      });
      (prisma['user'] as Record<string, jest.Mock>).count.mockResolvedValue(3); // at limit

      await expect(useCase.execute(makeDto(), TENANT_ID, CREATOR_ID)).rejects.toThrow(
        /máximo.*usuarios/,
      );
    });

    it('allows creation when plan has unlimited users (maxUsers = -1)', async () => {
      (prisma['user'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      (prisma['tenant'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({
        id: TENANT_ID,
        plan: { maxUsers: -1 },
      });
      (prisma['user'] as Record<string, jest.Mock>).count.mockResolvedValue(999);
      (prisma['user'] as Record<string, jest.Mock>).create.mockResolvedValue({ id: 'u', email: 'nuevo@test.com' });
      (prisma['userRole'] as Record<string, jest.Mock>).create.mockResolvedValue({});

      await expect(useCase.execute(makeDto(), TENANT_ID, CREATOR_ID)).resolves.toBeDefined();
    });
  });
});
