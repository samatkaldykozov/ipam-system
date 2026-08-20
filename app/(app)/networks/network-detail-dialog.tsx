'use client';

import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { statusBadgeVariant } from '@/app/(app)/networks/types';
import type { NetworkWithRelations } from '@/app/(app)/networks/types';

interface NetworkDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: NetworkWithRelations | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

export function NetworkDetailDialog({
  open,
  onOpenChange,
  network,
}: NetworkDetailDialogProps) {
  if (!network) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Network details</DialogTitle>
          <DialogDescription>
            Full information for {network.name}.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-4 py-2">
          <Field
            label="CIDR"
            value={<span className="font-mono">{network.cidr}</span>}
          />
          <Field
            label="Status"
            value={
              <Badge variant={statusBadgeVariant(network.status)}>
                {network.status.charAt(0) +
                  network.status.slice(1).toLowerCase()}
              </Badge>
            }
          />
          <Field label="Name" value={network.name} />
          <Field label="VLAN" value={network.vlanId?.toString()} />
          <Field
            label="Location"
            value={
              network.location
                ? `${network.location.name} (${network.location.code})`
                : null
            }
          />
          <Field
            label="Parent Network"
            value={
              network.parent
                ? `${network.parent.cidr}${network.parent.name ? ` — ${network.parent.name}` : ''}`
                : 'Top-level (no parent)'
            }
          />
          <Field label="Child Networks" value={network._count.children} />
          <Field label="IP Addresses" value={network._count.ipAddresses} />
          <Field
            label="Created"
            value={format(network.createdAt, 'MMM d, yyyy HH:mm')}
          />
          <Field
            label="Updated"
            value={format(network.updatedAt, 'MMM d, yyyy HH:mm')}
          />
        </dl>

        <Separator />

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="text-sm">
            {network.description || (
              <span className="text-muted-foreground">No description</span>
            )}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
