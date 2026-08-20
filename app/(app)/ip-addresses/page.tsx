import { Suspense } from 'react';
import { IpStatus } from '@prisma/client';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IpAddressesTable } from '@/app/(app)/ip-addresses/ip-addresses-table';
import {
  getIpAddresses,
  getNetworkOptions,
} from '@/app/(app)/ip-addresses/actions';
import type { SortField } from '@/app/(app)/ip-addresses/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;

function IpAddressesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[160px]" />
        </div>
      </div>
      <div className="rounded-lg border">
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b p-4 last:border-0"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function IpAddressesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;

  const search = get('q') ?? '';
  const status = (get('status') as IpStatus | 'ALL') ?? 'ALL';
  const networkId = get('networkId') ?? 'ALL';
  const sortBy = (get('sortBy') as SortField) ?? 'createdAt';
  const sortOrder = get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1);

  const [data, networks] = await Promise.all([
    getIpAddresses({
      search,
      status,
      networkId,
      sortBy,
      sortOrder,
      page,
      pageSize: PAGE_SIZE,
    }),
    getNetworkOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="IP Addresses"
        description="Track individual IP assignments across all networks."
      />

      <Card>
        <CardHeader>
          <CardTitle>IP Address Pool</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<IpAddressesSkeleton />}>
            <IpAddressesTable
              items={data.items}
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              totalPages={data.totalPages}
              networks={networks}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
