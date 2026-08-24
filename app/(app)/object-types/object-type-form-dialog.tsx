'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { objectTypeSchema, type ObjectTypeValues } from '@/lib/validations';
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
import { Textarea } from '@/components/ui/textarea';
import {
  createObjectType,
  updateObjectType,
} from '@/app/(app)/object-types/actions';
import { slugify } from '@/app/(app)/object-types/types';
import type { ObjectTypeWithCounts } from '@/app/(app)/object-types/types';

interface ObjectTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectType?: ObjectTypeWithCounts | null;
}

const EMPTY: ObjectTypeValues = { name: '', code: '', description: '' };

export function ObjectTypeFormDialog({
  open,
  onOpenChange,
  objectType,
}: ObjectTypeFormDialogProps) {
  const isEdit = !!objectType;
  const [submitting, setSubmitting] = React.useState(false);
  // Once editing an existing type, or once the admin has typed into the
  // code field directly, stop overwriting it from the name field.
  const codeTouched = React.useRef(false);

  const form = useForm<ObjectTypeValues>({
    resolver: zodResolver(objectTypeSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (open) {
      codeTouched.current = isEdit;
      if (objectType) {
        form.reset({
          name: objectType.name,
          code: objectType.code,
          description: objectType.description ?? '',
        });
      } else {
        form.reset(EMPTY);
      }
    }
  }, [open, objectType, isEdit, form]);

  async function onSubmit(values: ObjectTypeValues) {
    setSubmitting(true);
    const result = isEdit
      ? await updateObjectType(objectType!.id, values)
      : await createObjectType(values);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof ObjectTypeValues, { message });
        }
      }
      if (result.message && !result.fieldErrors) {
        toast.error(result.message);
      }
      return;
    }

    toast.success(
      result.message ?? (isEdit ? 'Тип объекта обновлён' : 'Тип объекта создан'),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Изменить тип объекта' : 'Новый тип объекта'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Обновите название, код или описание. Поля настраиваются отдельно, на странице типа.'
              : 'Например, «Паспорт КИС», «Паспорт БД», «ЦОД». Поля вы добавите на следующем шаге.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Паспорт КИС"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!codeTouched.current) {
                          form.setValue('code', slugify(e.target.value));
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Код</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="kis_passport"
                      className="font-mono"
                      {...field}
                      onChange={(e) => {
                        codeTouched.current = true;
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Только латиница, цифры и подчёркивания. Используется в
                    выгрузках для BI/Qlik — после создания менять код не
                    стоит.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Необязательно" {...field} />
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
                  'Создать'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
