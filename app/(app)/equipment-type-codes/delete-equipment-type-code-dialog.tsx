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
import { deleteEquipmentTypeCode } from '@/app/(app)/equipment-type-codes/actions';
import type { EquipmentTypeCodeRow } from '@/app/(app)/equipment-type-codes/equipment-type-codes-table';

interface DeleteEquipmentTypeCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: EquipmentTypeCodeRow | null;
}

export function DeleteEquipmentTypeCodeDialog({
  open,
  onOpenChange,
  code,
}: DeleteEquipmentTypeCodeDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!code) return null;

  const inUse = code._count.fields > 0;

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteEquipmentTypeCode(code!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Не удалось удалить код');
      return;
    }

    toast.success(result.message ?? 'Код удалён');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить код оборудования</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Удалить код{' '}
                <span className="font-medium text-foreground">{code.code}</span>{' '}
                («{code.label}»)?
              </p>
              {inUse ? (
                <p className="text-destructive">
                  Этот код используется в {code._count.fields} поле(ях). Сначала
                  измените их настройку.
                </p>
              ) : null}
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
            disabled={deleting || inUse}
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
