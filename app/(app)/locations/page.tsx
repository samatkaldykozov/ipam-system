import { Suspense } from 'react';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocationsTable } from '@/app/(app)/locations/locations-table';
import { getLocations, getLocationTree } from '@/app/(app)/locations/actions';
import type { SortField } from '@/app/(app)/locations/types';
import { getCurrentUser, canEdit } from '@/lib/auth';

const PAGE_SIZE = 10;

function LocationsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-xs" />
        <Skeleton className="h-10 w-[150px]" />
      </div>
      <div className="rounded-lg border">
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b p-4 last:border-0"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;

  const search = get('q') ?? '';
  const sortBy = (get('sortBy') as SortField) ?? 'name';
  const sortOrder = get('sortOrder') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1);

  const [data, treeItems, currentUser] = await Promise.all([
    getLocations({ search, sortBy, sortOrder, page, pageSize: PAGE_SIZE }),
    getLocationTree(),
    getCurrentUser(),
  ]);

  const userCanEdit = !!currentUser && canEdit(currentUser.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="The physical location hierarchy — regions, cities, buildings, rooms, secure zones, and racks — plus the sites your networks are assigned to."
      />

      <Card>
        <CardHeader>
          <CardTitle>Location Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LocationsSkeleton />}>
            <LocationsTable
              items={data.items}
              treeItems={treeItems}
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              totalPages={data.totalPages}
              canEdit={userCanEdit}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
