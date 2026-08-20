import type { IpAddress, IpStatus, Network } from '@prisma/client';

export type IpAddressWithNetwork = IpAddress & {
  network: Pick<Network, 'id' | 'cidr' | 'name'>;
};

export type NetworkOption = { id: string; name: string; cidr: string };

export const STATUS_OPTIONS: { label: string; value: IpStatus | 'ALL' }[] = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Available', value: 'AVAILABLE' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Reserved', value: 'RESERVED' },
  { label: 'Blocked', value: 'BLOCKED' },
];

export const IP_STATUSES: IpStatus[] = [
  'AVAILABLE',
  'ASSIGNED',
  'RESERVED',
  'BLOCKED',
];

export function statusBadgeVariant(status: IpStatus) {
  switch (status) {
    case 'ASSIGNED':
      return 'default' as const;
    case 'AVAILABLE':
      return 'secondary' as const;
    case 'RESERVED':
      return 'outline' as const;
    case 'BLOCKED':
      return 'destructive' as const;
  }
}

export type SortField = 'address' | 'hostname' | 'createdAt';
export type SortOrder = 'asc' | 'desc';
