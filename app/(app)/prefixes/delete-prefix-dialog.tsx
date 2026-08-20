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
import { deletePrefix } from '@/app/(app)/prefixes/actions';
import type { PrefixWithRelations } from '@/app/(app)/prefixes/types';

interface DeletePrefixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefix: PrefixWithRelations | null;
}

export function DeletePrefixDialog({
  open,
  onOpenChange,
  prefix,
}: DeletePrefixDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!prefix) return null;

  const hasChildren =
    prefix._count.childPrefixes > 0 || prefix._count.ipAddresses > 0;

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePrefix(prefix!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Failed to delete prefix');
      return;
    }

    toast.success(result.message ?? 'Prefix deleted');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete prefix</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-medium text-foreground">
                  {prefix.name ?? prefix.cidr}
                </span>{' '}
                ({prefix.cidr})? This action cannot be undone.
              </p>
              {hasChildren ? (
                <p className="text-destructive">
                  This prefix has {prefix._count.childPrefixes} child prefix(es)
                  and {prefix._count.ipAddresses} IP address(es) attached. You
                  must remove them before deleting this prefix.
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
            disabled={deleting || hasChildren}
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
