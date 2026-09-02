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
import { deleteObjectType } from '@/app/(app)/object-types/actions';
import type { ObjectTypeWithCounts } from '@/app/(app)/object-types/types';

interface DeleteObjectTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectType: ObjectTypeWithCounts | null;
}

export function DeleteObjectTypeDialog({
  open,
  onOpenChange,
  objectType,
}: DeleteObjectTypeDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!objectType) return null;

  const hasInstances = objectType._count.instances > 0;

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteObjectType(objectType!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Не удалось удалить тип объекта');
      return;
    }

    toast.success(result.message ?? 'Тип объекта удалён');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить тип объекта</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Удалить{' '}
                <span className="font-medium text-foreground">
                  {objectType.name}
                </span>{' '}
                и все его поля ({objectType._count.fields})? Это действие
                необратимо.
              </p>
              {hasInstances ? (
                <p className="text-destructive">
                  По этому типу заведено {objectType._count.instances} КЕ.
                  Сначала удалите или перенесите их.
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
            disabled={deleting || hasInstances}
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
