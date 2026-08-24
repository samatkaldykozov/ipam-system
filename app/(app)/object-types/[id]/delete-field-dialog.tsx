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
import { deleteFieldDefinition } from '@/app/(app)/object-types/actions';
import type { FieldDefinitionWithVisibility } from '@/app/(app)/object-types/types';

interface DeleteFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldDefinitionWithVisibility | null;
}

export function DeleteFieldDialog({
  open,
  onOpenChange,
  field,
}: DeleteFieldDialogProps) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  if (!field) return null;

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteFieldDefinition(field!.id);
    setDeleting(false);

    if (!result.ok) {
      setError(result.message ?? 'Не удалось удалить поле');
      return;
    }

    toast.success(result.message ?? 'Поле удалено');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить поле</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Удалить поле{' '}
                <span className="font-medium text-foreground">
                  {field.label}
                </span>
                ? Уже заполненные значения этого поля в существующих
                паспортах останутся в базе, но перестанут отображаться. Это
                действие необратимо.
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
