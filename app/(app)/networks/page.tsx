import { Suspense } from 'react';
import { NetworkStatus } from '@prisma/client';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { NetworksTable } from '@/app/(app)/networks/networks-table';
import { getNetworks, getLocations } from '@/app/(app)/networks/actions';
import type { SortField } from '@/app/(app)/networks/types';

const PAGE_SIZE = 10;

function NetworksSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-[160px]" />
          <Skeleton className="h-10 w-[130px]" />
        </div>
      </div>
      <div className="rounded-lg border">
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4 last:border-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
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

export default async function NetworksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;

  const search = get('q') ?? '';
  const status = (get('status') as NetworkStatus | 'ALL') ?? 'ALL';
  const sortBy = (get('sortBy') as SortField) ?? 'createdAt';
  const sortOrder = get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1);

  const [data, locations] = await Promise.all([
    getNetworks({ search, status, sortBy, sortOrder, page, pageSize: PAGE_SIZE }),
    getLocations(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Networks"
        description="Manage subnets and network blocks across your infrastructure."
      />

      <Card>
        <CardHeader>
          <CardTitle>Network Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<NetworksSkeleton />}>
            <NetworksTable
              items={data.items}
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              totalPages={data.totalPages}
              locations={locations}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}