'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { NetworkUtilization } from '@/app/(app)/networks/network-utilization';
import { getNetworkVisualization } from '@/app/(app)/networks/visualizer-actions';
import { statusBadgeVariant } from '@/app/(app)/networks/types';
import type { SubnetVisualization } from '@/app/(app)/networks/visualizer-actions';

interface SubnetVisualizerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: { id: string; cidr: string; name: string } | null;
}

type Crumb = { id: string; cidr: string; name: string };

const CELL_COLORS: Record<string, string> = {
  UNASSIGNED: 'border border-dashed border-muted-foreground/30 bg-muted/40',
  AVAILABLE: 'bg-emerald-500/70 hover:bg-emerald-500',
  ASSIGNED: 'bg-primary/80 hover:bg-primary',
  RESERVED: 'bg-amber-500/80 hover:bg-amber-500',
  BLOCKED: 'bg-red-500/80 hover:bg-red-500',
};

export function SubnetVisualizerDialog({
  open,
  onOpenChange,
  network,
}: SubnetVisualizerDialogProps) {
  const router = useRouter();
  const [stack, setStack] = React.useState<Crumb[]>([]);
  const [data, setData] = React.useState<SubnetVisualization | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open && network) {
      setStack([{ id: network.id, cidr: network.cidr, name: network.name }]);
    } else if (!open) {
      setStack([]);
      setData(null);
    }
  }, [open, network]);

  const current = stack[stack.length - 1] ?? null;

  React.useEffect(() => {
    if (!open || !current) return;
    let cancelled = false;
    setLoading(true);
    getNetworkVisualization(current.id).then((result) => {
      if (cancelled) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, current]);

  function drillInto(block: Crumb) {
    setStack((prev) => [...prev, block]);
  }

  function jumpTo(index: number) {
    setStack((prev) => prev.slice(0, index + 1));
  }

  function openAddress(address: string) {
    onOpenChange(false);
    router.push(`/ip-addresses?q=${encodeURIComponent(address)}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Subnet Visualizer</DialogTitle>
          <DialogDescription>
            Visual map of address space usage. Subnetted networks show their
            children as blocks — click one to drill in.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {stack.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              {index > 0 ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              ) : null}
              <button
                type="button"
                onClick={() => jumpTo(index)}
                disabled={index === stack.length - 1}
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono',
                  index === stack.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {crumb.cidr}
              </button>
            </React.Fragment>
          ))}
        </div>

        {loading || !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data.kind === 'not-found' ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            This network could not be loaded.
          </p>
        ) : data.kind === 'subnetted' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {data.name} is subnetted into {data.children.length} network
              {data.children.length === 1 ? '' : 's'}.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() =>
                    drillInto({
                      id: child.id,
                      cidr: child.cidr,
                      name: child.name,
                    })
                  }
                  className="flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate font-mono text-sm">
                      {child.cidr}
                    </span>
                    <Badge
                      variant={statusBadgeVariant(child.status)}
                      className="shrink-0"
                    >
                      {child.status.charAt(0) +
                        child.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {child.name}
                  </span>
                  <NetworkUtilization
                    cidr={child.cidr}
                    childCount={child.childCount}
                    ipAddressCount={child.ipAddressCount}
                    className="w-full min-w-0"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : data.kind === 'too-large' ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              {data.cidr} has{' '}
              {data.capacity?.toLocaleString() ?? 'a large number of'} usable
              addresses — too many to draw individually. Showing the summary
              utilization instead.
            </p>
            <NetworkUtilization
              cidr={data.cidr}
              childCount={0}
              ipAddressCount={data.ipAddressCount}
              className="w-full min-w-0"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
                Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary/80" />
                Assigned
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/80" />
                Reserved
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-500/80" />
                Blocked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted-foreground/30 bg-muted/40" />
                Unassigned
              </span>
            </div>

            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(16px, 1fr))',
              }}
            >
              {data.cells.map((cell) => {
                const clickable = cell.ipAddressId !== null;
                return (
                  <button
                    key={cell.address}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && openAddress(cell.address)}
                    title={`${cell.address}${cell.hostname ? ` — ${cell.hostname}` : ''} (${cell.status === 'UNASSIGNED' ? 'no record' : cell.status.toLowerCase()})`}
                    className={cn(
                      'aspect-square rounded-sm transition-colors',
                      CELL_COLORS[cell.status],
                      clickable ? 'cursor-pointer' : 'cursor-default',
                    )}
                  />
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              {data.cells.length.toLocaleString()} usable addresses in{' '}
              {data.cidr}. Hover a cell for details, click an assigned cell to
              open it.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
