'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/empty-state';
import { PrefixFormDialog } from '@/app/(app)/prefixes/prefix-form-dialog';
import { DeletePrefixDialog } from '@/app/(app)/prefixes/delete-prefix-dialog';
import { PrefixDetailDialog } from '@/app/(app)/prefixes/prefix-detail-dialog';
import {
  STATUS_OPTIONS,
  statusBadgeVariant,
  type NetworkOption,
  type PrefixWithRelations,
  type SortField,
} from '@/app/(app)/prefixes/types';

interface PrefixesTableProps {
  items: PrefixWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  networks: NetworkOption[];
}

export function PrefixesTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  networks,
}: PrefixesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [status, setStatus] = React.useState(
    searchParams.get('status') ?? 'ALL',
  );
  const [networkFilter, setNetworkFilter] = React.useState(
    searchParams.get('network') ?? 'ALL',
  );
  const [sortBy, setSortBy] = React.useState<SortField>(
    (searchParams.get('sortBy') as SortField) ?? 'createdAt',
  );
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>(
    searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] =
    React.useState<PrefixWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<PrefixWithRelations | null>(null);
  const [detailTarget, setDetailTarget] =
    React.useState<PrefixWithRelations | null>(null);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
      router.push(`/prefixes?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value });
    }, 350);
  }

  function handleStatus(value: string) {
    setStatus(value);
    updateParams({ status: value });
  }

  function handleNetwork(value: string) {
    setNetworkFilter(value);
    updateParams({ network: value });
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      const next = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', next);
      router.push(`/prefixes?${params.toString()}`, { scroll: false });
    } else {
      setSortBy(field);
      setSortOrder('asc');
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
      params.set('page', '1');
      router.push(`/prefixes?${params.toString()}`, { scroll: false });
    }
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/prefixes?${params.toString()}`, { scroll: false });
  }

  function SortHeader({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) {
    const active = sortBy === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? 'text-foreground' : ''
        } ${className ?? ''}`}
      >
        {children}
        {active ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    );
  }

  const hasItems = items.length > 0;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search CIDR, name…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={networkFilter} onValueChange={handleNetwork}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All networks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All networks</SelectItem>
              {networks.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name} ({n.cidr})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={handleStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Prefix
          </Button>
        </div>
      </div>

      {/* Table */}
      {hasItems ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="cidr">CIDR</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="name">Name</SortHeader>
                </TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Children / IPs</TableHead>
                <TableHead>
                  <SortHeader field="createdAt">Created</SortHeader>
                </TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((prefix) => (
                <TableRow key={prefix.id}>
                  <TableCell className="font-mono text-sm">
                    {prefix.cidr}
                  </TableCell>
                  <TableCell className="font-medium">
                    {prefix.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {prefix.network.name}{' '}
                      <span className="text-muted-foreground">
                        ({prefix.network.cidr})
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {prefix.parentPrefix ? (
                      <span className="flex items-center gap-1 text-sm">
                        <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                        {prefix.parentPrefix.cidr}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Top-level
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(prefix.status)}>
                      {prefix.status.charAt(0) +
                        prefix.status.slice(1).toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {prefix._count.childPrefixes} / {prefix._count.ipAddresses}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(prefix.createdAt, 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => setDetailTarget(prefix)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditTarget(prefix);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(prefix)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No prefixes found"
          description="Try adjusting your search or filters, or create a new prefix."
          action={
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Prefix
            </Button>
          }
        />
      )}

      {/* Pagination */}
      {hasItems && totalPages > 1 ? (
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

      {/* Dialogs */}
      <PrefixFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        networks={networks}
        prefix={editTarget}
      />
      <DeletePrefixDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        prefix={deleteTarget}
      />
      <PrefixDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        prefix={detailTarget}
      />
    </div>
  );
}
