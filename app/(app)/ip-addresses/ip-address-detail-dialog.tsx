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
import { statusBadgeVariant } from '@/app/(app)/ip-addresses/types';
import type { IpAddressWithNetwork } from '@/app/(app)/ip-addresses/types';

interface IpAddressDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ipAddress: IpAddressWithNetwork | null;
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

export function IpAddressDetailDialog({
  open,
  onOpenChange,
  ipAddress,
}: IpAddressDetailDialogProps) {
  if (!ipAddress) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>IP address details</DialogTitle>
          <DialogDescription>
            Full information for {ipAddress.address}.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-4 py-2">
          <Field
            label="Address"
            value={<span className="font-mono">{ipAddress.address}</span>}
          />
          <Field
            label="Status"
            value={
              <Badge variant={statusBadgeVariant(ipAddress.status)}>
                {ipAddress.status.charAt(0) +
                  ipAddress.status.slice(1).toLowerCase()}
              </Badge>
            }
          />
          <Field label="Hostname" value={ipAddress.hostname} />
          <Field label="MAC Address" value={ipAddress.macAddress} />
          <Field
            label="Network"
            value={`${ipAddress.network.cidr}${
              ipAddress.network.name ? ` — ${ipAddress.network.name}` : ''
            }`}
          />
          <Field
            label="Assigned"
            value={
              ipAddress.assignedAt
                ? format(ipAddress.assignedAt, 'MMM d, yyyy HH:mm')
                : null
            }
          />
          <Field
            label="Created"
            value={format(ipAddress.createdAt, 'MMM d, yyyy HH:mm')}
          />
          <Field
            label="Updated"
            value={format(ipAddress.updatedAt, 'MMM d, yyyy HH:mm')}
          />
        </dl>

        <Separator />

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="text-sm">
            {ipAddress.description || (
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
