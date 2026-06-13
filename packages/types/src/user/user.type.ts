export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
  LOCKED = 'locked',
}

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  emailVerifiedAt: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  language: string;
  timezone: string;
  roles: UserRoleDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleDto {
  roleId: string;
  roleName: string;
  roleSlug: string;
  branchId: string | null;
  branchName: string | null;
  assignedAt: string;
  expiresAt: string | null;
}

export interface CurrentUserDto extends UserDto {
  permissions: string[];
  activeBranchId: string | null;
  activeBranchName: string | null;
}
