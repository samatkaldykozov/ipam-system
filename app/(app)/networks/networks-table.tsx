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
  Download,
  Eye,
  Grid3x3,
  List,
  MoreHorizontal,
  Network as NetworkIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CsvImportDialog } from '@/components/csv-import-dialog';
import { NetworkUtilization } from '@/app/(app)/networks/network-utilization';
import { NetworkFormDialog } from '@/app/(app)/networks/network-form-dialog';
import { DeleteNetworkDialog } from '@/app/(app)/networks/delete-network-dialog';
import { NetworkDetailDialog } from '@/app/(app)/networks/network-detail-dialog';
import { SubnetVisualizerDialog } from '@/app/(app)/networks/subnet-visualizer-dialog';
import {
  exportNetworksCsv,
  importNetworksCsv,
} from '@/app/(app)/networks/csv-actions';
import {
  STATUS_OPTIONS,
  statusBadgeVariant,
  buildNetworkTree,
  flattenNetworkTree,
  type LocationOption,
  type NetworkWithRelations,
  type SortField,
} from '@/app/(app)/networks/types';

interface NetworksTableProps {
  items: NetworkWithRelations[];
  treeItems: NetworkWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  locations: LocationOption[];
  canEdit: boolean;
}

export function NetworksTable({
  items,
  treeItems,
  total,
  page,
  pageSize,
  totalPages,
  locations,
  canEdit,
}: NetworksTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [status, setStatus] = React.useState(
    searchParams.get('status') ?? 'ALL',
  );
  const [sortBy, setSortBy] = React.useState<SortField>(
    (searchParams.get('sortBy') as SortField) ?? 'createdAt',
  );
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>(
    searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] =
    React.useState<NetworkWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<NetworkWithRelations | null>(null);
  const [detailTarget, setDetailTarget] =
    React.useState<NetworkWithRelations | null>(null);
  const [visualizeTarget, setVisualizeTarget] =
    React.useState<NetworkWithRelations | null>(null);

  const [view, setView] = React.useState<'tree' | 'list'>('tree');
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [importOpen, setImportOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportNetworksCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `networks-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export networks');
    } finally {
      setExporting(false);
    }
  }

  const tree = React.useMemo(() => buildNetworkTree(treeItems), [treeItems]);
  const treeRows = React.useMemo(
    () => flattenNetworkTree(tree, expanded),
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
        if (value === undefined || value === '' || value === 'ALL') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.set('page', '1');
      router.push(`/networks?${params.toString()}`, { scroll: false });
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

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      const next = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', next);
      router.push(`/networks?${params.toString()}`, { scroll: false });
    } else {
      setSortBy(field);
      setSortOrder('asc');
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
      params.set('page', '1');
      router.push(`/networks?${params.toString()}`, { scroll: false });
    }
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/networks?${params.toString()}`, { scroll: false });
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

  function RowActions({ network }: { network: NetworkWithRelations }) {
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
          <DropdownMenuItem onClick={() => setDetailTarget(network)}>
            <Eye className="mr-2 h-4 w-4" />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setVisualizeTarget(network)}>
            <Grid3x3 className="mr-2 h-4 w-4" />
            Visualize
          </DropdownMenuItem>
          {canEdit ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setEditTarget(network);
                  setFormOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(network)}
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
              placeholder="Search CIDR, name, VLAN…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Showing the full network hierarchy. Switch to List to search.
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
              <NetworkIcon className="mr-1.5 h-3.5 w-3.5" />
              Tree
            </ToggleGroupItem>
            <ToggleGroupItem value="list" size="sm" aria-label="List view">
              <List className="mr-1.5 h-3.5 w-3.5" />
              List
            </ToggleGroupItem>
          </ToggleGroup>
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
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {canEdit ? (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Network
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
                  <TableHead>Network</TableHead>
                ) : (
                  <>
                    <TableHead>
                      <SortHeader field="cidr">CIDR</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader field="name">Name</SortHeader>
                    </TableHead>
                    <TableHead>Parent</TableHead>
                  </>
                )}
                <TableHead>Location</TableHead>
                <TableHead>VLAN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Utilization</TableHead>
                <TableHead className="max-w-[200px]">Description</TableHead>
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
                            <span className="font-mono text-sm">
                              {node.cidr}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {node.name}
                            </span>
                            {hasChildren ? (
                              <Badge
                                variant="outline"
                                className="ml-1 shrink-0"
                              >
                                {node.children.length}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {node.location ? (
                            <span className="text-sm">
                              {node.location.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {node.vlanId ? (
                            <span className="text-sm">{node.vlanId}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(node.status)}>
                            {node.status.charAt(0) +
                              node.status.slice(1).toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <NetworkUtilization
                            cidr={node.cidr}
                            childCount={node._count.children}
                            ipAddressCount={node._count.ipAddresses}
                          />
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {node.description ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions network={node} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                : items.map((network) => (
                    <TableRow key={network.id}>
                      <TableCell className="font-mono text-sm">
                        {network.cidr}
                      </TableCell>
                      <TableCell className="font-medium">
                        {network.name}
                      </TableCell>
                      <TableCell>
                        {network.parent ? (
                          <span className="flex items-center gap-1 text-sm">
                            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                            {network.parent.cidr}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Top-level
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {network.location ? (
                          <span className="text-sm">
                            {network.location.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {network.vlanId ? (
                          <span className="text-sm">{network.vlanId}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(network.status)}>
                          {network.status.charAt(0) +
                            network.status.slice(1).toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <NetworkUtilization
                          cidr={network.cidr}
                          childCount={network._count.children}
                          ipAddressCount={network._count.ipAddresses}
                        />
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {network.description ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(network.createdAt, 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions network={network} />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No networks found"
          description="Try adjusting your search or filters, or create a new network."
          action={
            canEdit ? (
              <Button
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Network
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Pagination */}
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
      <NetworkFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        locations={locations}
        network={editTarget}
      />
      <DeleteNetworkDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        network={deleteTarget}
      />
      <NetworkDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        network={detailTarget}
      />
      <SubnetVisualizerDialog
        open={!!visualizeTarget}
        onOpenChange={(open) => {
          if (!open) setVisualizeTarget(null);
        }}
        network={visualizeTarget}
      />
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Networks"
        description="Bulk-create or update networks from a CSV file."
        columnsHint="cidr, name, description, vlanId, status, locationCode, parentCidr"
        onImport={importNetworksCsv}
      />
    </div>
  );
}
