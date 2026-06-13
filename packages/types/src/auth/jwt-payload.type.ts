export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  branchId: string | null;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}
