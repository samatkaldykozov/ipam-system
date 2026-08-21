'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteLocation } from '@/app/(app)/locations/actions';
import type { LocationWithCount } from '@/app/(app)/locations/types';

interface DeleteLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationWithCount | null;
}

export function DeleteLocationDialog({
  open,
  onOpenChange,
  location,
}: DeleteLocationDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!location) return null;

  const hasNetworks = location._count.networks > 0;

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteLocation(location!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Failed to delete location');
      return;
    }

    toast.success(result.message ?? 'Location deleted');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete location</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-medium text-foreground">
                  {location.name}
                </span>{' '}
                ({location.code})? This action cannot be undone.
              </p>
              {hasNetworks ? (
                <p className="text-destructive">
                  This location has {location._count.networks} network(s)
                  assigned to it. You must reassign or remove them before
                  deleting this location.
                </p>
              ) : null}
              {error ? <p className="text-destructive">{error}</p> : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={deleting || hasNetworks}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
