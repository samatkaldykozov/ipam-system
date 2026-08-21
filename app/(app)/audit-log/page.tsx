import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { AuditAction } from '@prisma/client';

import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth';
import {
  getAuditLogs,
  getAuditLogEntities,
  getAuditLogUsers,
} from '@/app/(app)/audit-log/actions';
import { AuditLogTable } from '@/app/(app)/audit-log/audit-log-table';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

function AuditLogSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-[160px]" />
        ))}
      </div>
      <div className="rounded-lg border">
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b p-4 last:border-0"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();

  // Open to every signed-in role (Admin, Network Engineer, Viewer) — see
  // the RBAC plan. This guard exists only as a defensive backstop in case
  // middleware doesn't cover this route for some reason, same as Settings.
  if (!currentUser) {
    redirect('/login');
  }

  const params = await searchParams;
  const get = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;

  const action = (get('action') as AuditAction | 'ALL') ?? 'ALL';
  const entity = get('entity') ?? 'ALL';
  const userId = get('userId') ?? 'ALL';
  const dateFrom = get('dateFrom');
  const dateTo = get('dateTo');
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1);

  const [data, entities, users] = await Promise.all([
    getAuditLogs({
      action,
      entity,
      userId,
      dateFrom,
      dateTo,
      page,
      pageSize: PAGE_SIZE,
    }),
    getAuditLogEntities(),
    getAuditLogUsers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Every create, update, and delete across the app, plus sign-in activity."
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<AuditLogSkeleton />}>
            <AuditLogTable
              items={data.items}
              total={data.total}
              page={data.page}
              pageSize={data.pageSize}
              totalPages={data.totalPages}
              entities={entities}
              users={users}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
