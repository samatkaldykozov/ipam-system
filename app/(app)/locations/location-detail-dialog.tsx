'use client';

import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';

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
import type { LocationWithCount } from '@/app/(app)/locations/types';

interface LocationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationWithCount | null;
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

export function LocationDetailDialog({
  open,
  onOpenChange,
  location,
}: LocationDetailDialogProps) {
  if (!location) return null;

  const hasCoordinates =
    location.latitude !== null &&
    location.latitude !== undefined &&
    location.longitude !== null &&
    location.longitude !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Location details</DialogTitle>
          <DialogDescription>
            Full information for {location.name}.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-4 py-2">
          <Field label="Name" value={location.name} />
          <Field
            label="Code"
            value={<span className="font-mono">{location.code}</span>}
          />
          <Field label="City" value={location.city} />
          <Field label="Country" value={location.country} />
          <Field label="Address" value={location.address} />
          <Field
            label="Networks"
            value={<Badge variant="outline">{location._count.networks}</Badge>}
          />
          <Field
            label="Created"
            value={format(location.createdAt, 'MMM d, yyyy HH:mm')}
          />
          <Field
            label="Updated"
            value={format(location.updatedAt, 'MMM d, yyyy HH:mm')}
          />
        </dl>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Coordinates
          </p>
          {hasCoordinates ? (
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {location.latitude}, {location.longitude}
              </span>
              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View on map
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No coordinates on file
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="text-sm">
            {location.description || (
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
