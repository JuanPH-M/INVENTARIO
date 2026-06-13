import type { PaginationMeta, PaginatedResponse } from '@inventario/types';

export interface FindManyParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePaginationParams(
  page?: number | string,
  limit?: number | string,
): FindManyParams {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    meta: buildMeta(total, page, limit),
    timestamp: new Date().toISOString(),
  };
}
