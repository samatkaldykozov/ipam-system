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
import { deleteIpAddress } from '@/app/(app)/ip-addresses/actions';
import type { IpAddressWithNetwork } from '@/app/(app)/ip-addresses/types';

interface DeleteIpAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ipAddress: IpAddressWithNetwork | null;
}

export function DeleteIpAddressDialog({
  open,
  onOpenChange,
  ipAddress,
}: DeleteIpAddressDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!ipAddress) return null;

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteIpAddress(ipAddress!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Failed to delete IP address');
      return;
    }

    toast.success(result.message ?? 'IP address deleted');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete IP address</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-medium text-foreground">
                  {ipAddress.address}
                </span>
                {ipAddress.hostname ? ` (${ipAddress.hostname})` : ''}? This
                action cannot be undone.
              </p>
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
            disabled={deleting}
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
