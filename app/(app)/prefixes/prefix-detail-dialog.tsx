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
import { statusBadgeVariant } from '@/app/(app)/prefixes/types';
import type { PrefixWithRelations } from '@/app/(app)/prefixes/types';

interface PrefixDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefix: PrefixWithRelations | null;
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

export function PrefixDetailDialog({
  open,
  onOpenChange,
  prefix,
}: PrefixDetailDialogProps) {
  if (!prefix) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Prefix details</DialogTitle>
          <DialogDescription>
            Full information for {prefix.name ?? prefix.cidr}.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-4 py-2">
          <Field
            label="CIDR"
            value={<span className="font-mono">{prefix.cidr}</span>}
          />
          <Field
            label="Status"
            value={
              <Badge variant={statusBadgeVariant(prefix.status)}>
                {prefix.status.charAt(0) + prefix.status.slice(1).toLowerCase()}
              </Badge>
            }
          />
          <Field label="Name" value={prefix.name} />
          <Field
            label="Network"
            value={`${prefix.network.name} (${prefix.network.cidr})`}
          />
          <Field
            label="Parent Prefix"
            value={
              prefix.parentPrefix
                ? `${prefix.parentPrefix.cidr}${prefix.parentPrefix.name ? ` — ${prefix.parentPrefix.name}` : ''}`
                : 'Top-level (directly under network)'
            }
          />
          <Field label="Child Prefixes" value={prefix._count.childPrefixes} />
          <Field label="IP Addresses" value={prefix._count.ipAddresses} />
          <Field
            label="Created"
            value={format(prefix.createdAt, 'MMM d, yyyy HH:mm')}
          />
          <Field
            label="Updated"
            value={format(prefix.updatedAt, 'MMM d, yyyy HH:mm')}
          />
        </dl>

        <Separator />

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="text-sm">
            {prefix.description || (
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
