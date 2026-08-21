'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, History, X } from 'lucide-react';
import type { AuditAction } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { describeChange } from '@/lib/audit-log-utils';
import {
  ACTION_OPTIONS,
  actionBadgeVariant,
  type AuditLogUser,
} from '@/app/(app)/audit-log/types';

type AuditLogRow = {
  id: string;
  action: AuditAction;
  entity: string;
  metadata: unknown;
  createdAt: Date;
  user: { email: string } | null;
};

interface AuditLogTableProps {
  items: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  entities: string[];
  users: AuditLogUser[];
}

export function AuditLogTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  entities,
  users,
}: AuditLogTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const action = searchParams.get('action') ?? 'ALL';
  const entity = searchParams.get('entity') ?? 'ALL';
  const userId = searchParams.get('userId') ?? 'ALL';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';

  const hasFilters =
    action !== 'ALL' ||
    entity !== 'ALL' ||
    userId !== 'ALL' ||
    !!dateFrom ||
    !!dateTo;

  const updateParams = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '' || value === 'ALL') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.set('page', '1');
      router.push(`/audit-log?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  function clearFilters() {
    router.push('/audit-log', { scroll: false });
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/audit-log?${params.toString()}`, { scroll: false });
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select
            value={action}
            onValueChange={(v) => updateParams({ action: v })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Entity</Label>
          <Select
            value={entity}
            onValueChange={(v) => updateParams({ entity: v })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All entities</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">User</Label>
          <Select
            value={userId}
            onValueChange={(v) => updateParams({ userId: v })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value })}
          />
        </div>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* Table */}
      {items.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Time</TableHead>
                <TableHead className="w-[200px]">Actor</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
                <TableHead className="w-[120px]">Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(log.createdAt, 'MMM d, yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.user?.email ?? (
                      <span className="text-muted-foreground">
                        Unknown user
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionBadgeVariant(log.action)}>
                      {log.action.charAt(0) + log.action.slice(1).toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.entity}
                  </TableCell>
                  <TableCell className="text-sm">
                    {describeChange(log)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="No activity found"
          description={
            hasFilters
              ? 'Try adjusting or clearing your filters.'
              : 'Changes you make across the app will show up here.'
          }
        />
      )}

      {/* Pagination */}
      {items.length > 0 && totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {start}–{end} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
