import type { Network, Location, NetworkStatus } from '@prisma/client';

export type NetworkWithRelations = Network & {
  location: Location | null;
  parent: Pick<Network, 'id' | 'cidr' | 'name'> | null;
  _count: { children: number; ipAddresses: number };
};

export type LocationOption = { id: string; name: string; code: string };

export type ParentOption = { id: string; cidr: string; name: string };

export const STATUS_OPTIONS: { label: string; value: NetworkStatus | 'ALL' }[] =
  [
    { label: 'All statuses', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Reserved', value: 'RESERVED' },
    { label: 'Archived', value: 'ARCHIVED' },
  ];

export const NETWORK_STATUSES: NetworkStatus[] = [
  'ACTIVE',
  'RESERVED',
  'ARCHIVED',
];

export function statusBadgeVariant(status: NetworkStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'default' as const;
    case 'RESERVED':
      return 'secondary' as const;
    case 'ARCHIVED':
      return 'outline' as const;
  }
}

export type SortField = 'cidr' | 'name' | 'vlanId' | 'createdAt';
export type SortOrder = 'asc' | 'desc';
