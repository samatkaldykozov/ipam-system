'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  equipmentTypeCodeSchema,
  type EquipmentTypeCodeValues,
} from '@/lib/validations';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  createEquipmentTypeCode,
  updateEquipmentTypeCode,
} from '@/app/(app)/equipment-type-codes/actions';
import type { EquipmentTypeCodeRow } from '@/app/(app)/equipment-type-codes/equipment-type-codes-table';

interface EquipmentTypeCodeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code?: EquipmentTypeCodeRow | null;
}

const EMPTY: EquipmentTypeCodeValues = { code: '', label: '' };

export function EquipmentTypeCodeFormDialog({
  open,
  onOpenChange,
  code,
}: EquipmentTypeCodeFormDialogProps) {
  const isEdit = !!code;
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<EquipmentTypeCodeValues>({
    resolver: zodResolver(equipmentTypeCodeSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (open) {
      form.reset(code ? { code: code.code, label: code.label } : EMPTY);
    }
  }, [open, code, form]);

  async function onSubmit(values: EquipmentTypeCodeValues) {
    setSubmitting(true);
    const result = isEdit
      ? await updateEquipmentTypeCode(code!.id, values)
      : await createEquipmentTypeCode(values);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof EquipmentTypeCodeValues, { message });
        }
      }
      if (result.message && !result.fieldErrors) {
        toast.error(result.message);
      }
      return;
    }

    toast.success(result.message ?? (isEdit ? 'Код обновлён' : 'Код добавлен'));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Изменить код' : 'Новый код оборудования'}
          </DialogTitle>
          <DialogDescription>
            Код и название из таблицы 2 инструкции по идентификации объектов
            (ДИТ/И-05-28.2-16), например «cs» — Коммутатор.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Код</FormLabel>
                  <FormControl>
                    <Input placeholder="cs" className="font-mono" {...field} />
                  </FormControl>
                  <FormDescription>
                    Как в инструкции — буквы и цифры, без пробелов. Регистр
                    сохраняется (например «Pdu»).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input placeholder="Коммутатор" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение…
                  </>
                ) : isEdit ? (
                  'Сохранить'
                ) : (
                  'Добавить'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
