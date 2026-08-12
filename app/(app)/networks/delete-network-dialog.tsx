'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { deleteNetwork } from '@/app/(app)/networks/actions';
import type { NetworkWithRelations } from '@/app/(app)/networks/types';

interface DeleteNetworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network: NetworkWithRelations | null;
}

export function DeleteNetworkDialog({
  open,
  onOpenChange,
  network,
}: DeleteNetworkDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!network) return null;

  const hasChildren =
    network._count.prefixes > 0 || network._count.ipAddresses > 0;

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteNetwork(network!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Failed to delete network');
      return;
    }

    toast.success(result.message ?? 'Network deleted');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete network</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-medium text-foreground">
                  {network.name}
                </span>{' '}
                ({network.cidr})? This action cannot be undone.
              </p>
              {hasChildren ? (
                <p className="text-destructive">
                  This network has {network._count.prefixes} prefix(es) and{' '}
                  {network._count.ipAddresses} IP address(es) attached. You must
                  remove them before deleting this network.
                </p>
              ) : null}
              {error ? (
                <p className="text-destructive">{error}</p>
              ) : null}
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