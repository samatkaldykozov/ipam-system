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
  List,
  MapPin,
  MoreHorizontal,
  Network as TreeIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/empty-state';
import { LocationFormDialog } from '@/app/(app)/locations/location-form-dialog';
import { DeleteLocationDialog } from '@/app/(app)/locations/delete-location-dialog';
import { LocationDetailDialog } from '@/app/(app)/locations/location-detail-dialog';
import {
  buildLocationTree,
  flattenLocationTree,
  locationKindLabel,
  type LocationWithCount,
  type SortField,
} from '@/app/(app)/locations/types';

interface LocationsTableProps {
  items: LocationWithCount[];
  treeItems: LocationWithCount[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  canEdit: boolean;
}

export function LocationsTable({
  items,
  treeItems,
  total,
  page,
  pageSize,
  totalPages,
  canEdit,
}: LocationsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [sortBy, setSortBy] = React.useState<SortField>(
    (searchParams.get('sortBy') as SortField) ?? 'name',
  );
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>(
    searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc',
  );

  const [view, setView] = React.useState<'tree' | 'list'>('tree');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LocationWithCount | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    React.useState<LocationWithCount | null>(null);
  const [detailTarget, setDetailTarget] =
    React.useState<LocationWithCount | null>(null);

  const tree = React.useMemo(() => buildLocationTree(treeItems), [treeItems]);
  const treeRows = React.useMemo(
    () => flattenLocationTree(tree, expanded),
    [tree, expanded],
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateParams = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.set('page', '1');
      router.push(`/locations?${params.toString()}`, { scroll: false });
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

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      const next = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', next);
      router.push(`/locations?${params.toString()}`, { scroll: false });
    } else {
      setSortBy(field);
      setSortOrder('asc');
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
      params.set('page', '1');
      router.push(`/locations?${params.toString()}`, { scroll: false });
    }
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/locations?${params.toString()}`, { scroll: false });
  }

  function SortHeader({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) {
    const active = sortBy === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={`flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? 'text-foreground' : ''
        }`}
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

  function RowActions({ location }: { location: LocationWithCount }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setDetailTarget(location)}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
          {canEdit ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setEditTarget(location);
                  setFormOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(location)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function KindBadge({ kind }: { kind: LocationWithCount['kind'] }) {
    return (
      <Badge variant="outline" className="shrink-0 font-normal">
        {locationKindLabel(kind)}
      </Badge>
    );
  }

  const hasItems = view === 'tree' ? treeRows.length > 0 : items.length > 0;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {view === 'list' ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, code, city…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Showing the full location hierarchy. Switch to List to search.
          </p>
        )}
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => {
              if (value === 'tree' || value === 'list') setView(value);
            }}
            className="rounded-md border p-0.5"
          >
            <ToggleGroupItem value="tree" size="sm" aria-label="Tree view">
              <TreeIcon className="mr-1.5 h-3.5 w-3.5" />
              Tree
            </ToggleGroupItem>
            <ToggleGroupItem value="list" size="sm" aria-label="List view">
              <List className="mr-1.5 h-3.5 w-3.5" />
              List
            </ToggleGroupItem>
          </ToggleGroup>
          {canEdit ? (
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Location
            </Button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      {hasItems ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {view === 'tree' ? (
                  <TableHead>Location</TableHead>
                ) : (
                  <>
                    <TableHead>
                      <SortHeader field="name">Name</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader field="code">Code</SortHeader>
                    </TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>
                      <SortHeader field="city">City / Country</SortHeader>
                    </TableHead>
                  </>
                )}
                <TableHead>Networks</TableHead>
                {view === 'list' ? (
                  <TableHead>
                    <SortHeader field="createdAt">Created</SortHeader>
                  </TableHead>
                ) : null}
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view === 'tree'
                ? treeRows.map(({ node, depth }) => {
                    const hasChildren = node.children.length > 0;
                    const isExpanded = expanded.has(node.id);
                    return (
                      <TableRow key={node.id}>
                        <TableCell>
                          <div
                            className="flex items-center gap-1.5"
                            style={{ paddingLeft: depth * 24 }}
                          >
                            {hasChildren ? (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(node.id)}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                <ChevronRight
                                  className={cn(
                                    'h-3.5 w-3.5 transition-transform',
                                    isExpanded && 'rotate-90',
                                  )}
                                />
                              </button>
                            ) : (
                              <span className="w-5 shrink-0" />
                            )}
                            <span className="font-medium">{node.name}</span>
                            <span className="font-mono text-sm text-muted-foreground">
                              {node.code}
                              {node.rowCode ? ` (row ${node.rowCode})` : ''}
                            </span>
                            <KindBadge kind={node.kind} />
                            {hasChildren ? (
                              <Badge
                                variant="secondary"
                                className="ml-1 shrink-0"
                              >
                                {node.children.length}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {node._count.networks}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions location={node} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                : items.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">
                        {location.name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {location.code}
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={location.kind} />
                      </TableCell>
                      <TableCell>
                        {location.parent ? (
                          <span className="flex items-center gap-1 text-sm">
                            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                            {location.parent.name}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Top-level
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {location.city || location.country ? (
                          <span className="text-sm">
                            {[location.city, location.country]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {location._count.networks}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(location.createdAt, 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions location={location} />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="No locations found"
          description="Try adjusting your search, or create a new location."
          action={
            canEdit ? (
              <Button
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Location
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Pagination — list view only, the tree always shows everything */}
      {view === 'list' && hasItems && totalPages > 1 ? (
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
      <LocationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        location={editTarget}
      />
      <DeleteLocationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        location={deleteTarget}
      />
      <LocationDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        location={detailTarget}
      />
    </div>
  );
}
