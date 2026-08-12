import type { Prefix, Network, PrefixStatus } from '@prisma/client';

export type PrefixWithRelations = Prefix & {
  network: Pick<Network, 'id' | 'name' | 'cidr'>;
  parentPrefix: Pick<Prefix, 'id' | 'cidr' | 'name'> | null;
  _count: { childPrefixes: number; ipAddresses: number };
};

export type NetworkOption = { id: string; name: string; cidr: string };

export type ParentPrefixOption = {
  id: string;
  cidr: string;
  name: string | null;
  networkId: string;
};

export const STATUS_OPTIONS: { label: string; value: PrefixStatus | 'ALL' }[] = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Reserved', value: 'RESERVED' },
  { label: 'Deprecated', value: 'DEPRECATED' },
];

export const PREFIX_STATUSES: PrefixStatus[] = ['ACTIVE', 'RESERVED', 'DEPRECATED'];

export function statusBadgeVariant(status: PrefixStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'default' as const;
    case 'RESERVED':
      return 'secondary' as const;
    case 'DEPRECATED':
      return 'outline' as const;
  }
}

export type SortField = 'cidr' | 'name' | 'createdAt';
export type SortOrder = 'asc' | 'desc';
