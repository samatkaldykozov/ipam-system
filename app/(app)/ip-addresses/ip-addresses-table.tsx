'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { CsvImportDialog } from '@/components/csv-import-dialog';
import { AssignIpDialog } from '@/app/(app)/ip-addresses/assign-ip-dialog';
import { DeleteIpAddressDialog } from '@/app/(app)/ip-addresses/delete-ip-address-dialog';
import { IpAddressDetailDialog } from '@/app/(app)/ip-addresses/ip-address-detail-dialog';
import {
  exportIpAddressesCsv,
  importIpAddressesCsv,
} from '@/app/(app)/ip-addresses/csv-actions';
import {
  branchLabel,
  deviceTypeLabel,
  STATUS_OPTIONS,
  statusBadgeVariant,
  type IpAddressWithNetwork,
  type NetworkOption,
  type SortField,
} from '@/app/(app)/ip-addresses/types';

interface IpAddressesTableProps {
  items: IpAddressWithNetwork[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  networks: NetworkOption[];
  canEdit: boolean;
}

export function IpAddressesTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  networks,
  canEdit,
}: IpAddressesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [status, setStatus] = React.useState(
    searchParams.get('status') ?? 'ALL',
  );
  const [networkId, setNetworkId] = React.useState(
    searchParams.get('networkId') ?? 'ALL',
  );
  const [sortBy, setSortBy] = React.useState<SortField>(
    (searchParams.get('sortBy') as SortField) ?? 'createdAt',
  );
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>(
    searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] =
    React.useState<IpAddressWithNetwork | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<IpAddressWithNetwork | null>(null);
  const [detailTarget, setDetailTarget] =
    React.useState<IpAddressWithNetwork | null>(null);

  const [importOpen, setImportOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportIpAddressesCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ip-addresses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export IP addresses');
    } finally {
      setExporting(false);
    }
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
      router.push(`/ip-addresses?${params.toString()}`, { scroll: false });
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
    setNetworkId(value);
    updateParams({ networkId: value });
  }

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      const next = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', next);
      router.push(`/ip-addresses?${params.toString()}`, { scroll: false });
    } else {
      setSortBy(field);
      setSortOrder('asc');
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
      params.set('page', '1');
      router.push(`/ip-addresses?${params.toString()}`, { scroll: false });
    }
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/ip-addresses?${params.toString()}`, { scroll: false });
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
            placeholder="Search address, hostname, MAC…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={networkId} onValueChange={handleNetwork}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All networks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All networks</SelectItem>
              {networks.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.cidr} — {n.name}
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
              Assign IP
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
                <TableHead>
                  <SortHeader field="address">Address</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="hostname">Hostname</SortHeader>
                </TableHead>
                <TableHead>MAC Address</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Филиал</TableHead>
                <TableHead>Тип устройства</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="max-w-[200px]">Description</TableHead>
                <TableHead>
                  <SortHeader field="createdAt">Created</SortHeader>
                </TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ip) => (
                <TableRow key={ip.id}>
                  <TableCell className="font-mono text-sm">
                    {ip.address}
                  </TableCell>
                  <TableCell className="font-medium">
                    {ip.hostname || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {ip.macAddress ? (
                      <span className="font-mono text-sm">{ip.macAddress}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col text-sm">
                      <span className="font-mono">{ip.network.cidr}</span>
                      <span className="text-xs text-muted-foreground">
                        {ip.network.name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {branchLabel(ip.branch) ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {deviceTypeLabel(ip.deviceType) ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(ip.status)}>
                      {ip.status.charAt(0) + ip.status.slice(1).toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {ip.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(ip.createdAt, 'MMM d, yyyy')}
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
                        <DropdownMenuItem onClick={() => setDetailTarget(ip)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View details
                        </DropdownMenuItem>
                        {canEdit ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTarget(ip);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(ip)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
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
          icon={<Server className="h-6 w-6" />}
          title="No IP addresses found"
          description="Try adjusting your search or filters, or assign a new IP address."
          action={
            canEdit ? (
              <Button
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Assign IP
              </Button>
            ) : undefined
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
      <AssignIpDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        networks={networks}
        ipAddress={editTarget}
      />
      <DeleteIpAddressDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        ipAddress={deleteTarget}
      />
      <IpAddressDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
        ipAddress={detailTarget}
      />
      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import IP Addresses"
        description="Bulk-create or update IP addresses from a CSV file."
        columnsHint="address, hostname, macAddress, status, description, networkCidr, branch, responsibleParty, purpose, deviceType, basis"
        onImport={importIpAddressesCsv}
      />
    </div>
  );
}
