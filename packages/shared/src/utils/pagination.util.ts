import type { PaginationMeta, PaginationQuery } from '@inventario/types';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: PaginationQuery): PaginationParams {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
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

export function buildPrismaOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowedFields: string[],
  defaultField: string = 'createdAt',
): Record<string, 'asc' | 'desc'> {
  const field =
    sortBy && allowedFields.includes(sortBy) ? sortBy : defaultField;
  return { [field]: sortOrder ?? 'desc' };
}
