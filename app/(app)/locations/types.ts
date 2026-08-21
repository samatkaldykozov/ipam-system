import type { Location } from '@prisma/client';

export type LocationWithCount = Location & {
  _count: { networks: number };
};

export type SortField = 'name' | 'code' | 'city' | 'createdAt';
export type SortOrder = 'asc' | 'desc';
