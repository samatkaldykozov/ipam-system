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
import { deletePassport } from '@/app/(app)/passports/actions';
import type { PassportListItem } from '@/app/(app)/passports/types';

interface DeletePassportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passport: PassportListItem | null;
}

export function DeletePassportDialog({
  open,
  onOpenChange,
  passport,
}: DeletePassportDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!passport) return null;

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePassport(passport!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Не удалось удалить КЕ');
      return;
    }

    toast.success(result.message ?? 'КЕ удалена');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить КЕ</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Удалить КЕ{' '}
                <span className="font-medium text-foreground">
                  {passport.name}
                </span>
                ? Это действие необратимо.
              </p>
              {error ? <p className="text-destructive">{error}</p> : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
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
                Удаление…
              </>
            ) : (
              'Удалить'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
