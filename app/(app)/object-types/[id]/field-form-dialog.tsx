'use client';

import * as React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createFieldDefinition,
  updateFieldDefinition,
} from '@/app/(app)/object-types/actions';
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  TABLE_COLUMN_TYPES,
  slugify,
  type FieldDefinitionWithVisibility,
  type FieldTypeValue,
  type TableColumnType,
} from '@/app/(app)/object-types/types';

interface FieldFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectTypeId: string;
  field?: FieldDefinitionWithVisibility | null;
  passportRoles: Role[];
}

type FormValues = {
  sectionName: string;
  key: string;
  label: string;
  helpText: string;
  type: FieldTypeValue;
  required: boolean;
  visibleToAll: boolean;
  visibleRoleIds: string[];
  options: { value: string }[];
  tableColumns: { key: string; label: string; type: TableColumnType }[];
  validateAsIp: boolean;
};

const EMPTY: FormValues = {
  sectionName: '',
  key: '',
  label: '',
  helpText: '',
  type: 'TEXT',
  required: false,
  visibleToAll: true,
  visibleRoleIds: [],
  options: [],
  tableColumns: [],
  validateAsIp: false,
};

export function FieldFormDialog({
  open,
  onOpenChange,
  objectTypeId,
  field,
  passportRoles,
}: FieldFormDialogProps) {
  const isEdit = !!field;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Once editing an existing field, or once the admin has typed into the
  // key field directly, stop overwriting it from the label field.
  const keyTouched = React.useRef(false);

  const form = useForm<FormValues>({ defaultValues: EMPTY });
  const { control, register, handleSubmit, watch, setValue, getValues, reset, formState } =
    form;

  const optionsArray = useFieldArray({ control, name: 'options' });
  const columnsArray = useFieldArray({ control, name: 'tableColumns' });

  const type = watch('type');
  const visibleToAll = watch('visibleToAll');

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    keyTouched.current = isEdit;
    if (field) {
      reset({
        sectionName: field.sectionName ?? '',
        key: field.key,
        label: field.label,
        helpText: field.helpText ?? '',
        type: field.type as FieldTypeValue,
        required: field.required,
        visibleToAll: field.visibleToAll,
        visibleRoleIds: field.visibleRoles.map((v) => v.roleId),
        options: Array.isArray(field.options)
          ? (field.options as string[]).map((value) => ({ value }))
          : [],
        tableColumns: Array.isArray(field.tableColumns)
          ? (field.tableColumns as {
              key: string;
              label: string;
              type: TableColumnType;
            }[])
          : [],
        validateAsIp: field.validateAsIp,
      });
    } else {
      reset(EMPTY);
    }
  }, [open, field, isEdit, reset]);

  async function onSubmit(values: FormValues) {
    setError(null);

    const label = values.label.trim();
    const key = values.key.trim();
    if (!label) {
      form.setError('label', { message: 'Укажите подпись поля' });
      return;
    }
    if (!key || !/^[a-z0-9_]+$/.test(key)) {
      form.setError('key', {
        message: 'Только строчные латинские буквы, цифры и подчёркивания',
      });
      return;
    }

    const options = values.options.map((o) => o.value.trim()).filter(Boolean);
    if (values.type === 'SELECT' && options.length === 0) {
      toast.error('Добавьте хотя бы один вариант выбора');
      return;
    }

    const tableColumns = values.tableColumns
      .map((c) => ({ ...c, key: c.key.trim(), label: c.label.trim() }))
      .filter((c) => c.key && c.label);
    if (values.type === 'TABLE' && tableColumns.length === 0) {
      toast.error('Добавьте хотя бы один столбец таблицы');
      return;
    }

    const payload = {
      sectionName: values.sectionName.trim() || undefined,
      key,
      label,
      helpText: values.helpText.trim() || undefined,
      type: values.type,
      required: values.required,
      visibleToAll: values.visibleToAll,
      visibleRoleIds: values.visibleToAll ? [] : values.visibleRoleIds,
      options,
      tableColumns,
      validateAsIp: values.type === 'TEXT' ? values.validateAsIp : false,
    };

    setSubmitting(true);
    const result = isEdit
      ? await updateFieldDefinition(field!.id, payload)
      : await createFieldDefinition(objectTypeId, payload);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [f, message] of Object.entries(result.fieldErrors)) {
          if (f === 'key' || f === 'label' || f === 'sectionName') {
            form.setError(f as keyof FormValues, { message });
          } else {
            toast.error(message);
          }
        }
      }
      if (result.message && !result.fieldErrors) {
        setError(result.message);
      }
      return;
    }

    toast.success(
      result.message ?? (isEdit ? 'Поле обновлено' : 'Поле добавлено'),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Изменить поле' : 'Новое поле'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Обновите настройки поля.'
              : 'Добавьте поле в этот тип паспорта.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="field-section">Раздел</Label>
            <Input
              id="field-section"
              placeholder="1. Общая информация"
              {...register('sectionName')}
            />
            <p className="text-xs text-muted-foreground">
              Необязательно. Поля с одинаковым разделом группируются вместе.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="field-label">Подпись</Label>
            <Controller
              control={control}
              name="label"
              render={({ field: f }) => (
                <Input
                  id="field-label"
                  placeholder="Наименование ИС"
                  value={f.value}
                  onChange={(e) => {
                    f.onChange(e.target.value);
                    if (!keyTouched.current) {
                      setValue('key', slugify(e.target.value));
                    }
                  }}
                />
              )}
            />
            {formState.errors.label ? (
              <p className="text-sm text-destructive">
                {formState.errors.label.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="field-key">Ключ</Label>
            <Controller
              control={control}
              name="key"
              render={({ field: f }) => (
                <Input
                  id="field-key"
                  placeholder="is_name"
                  className="font-mono"
                  value={f.value}
                  onChange={(e) => {
                    keyTouched.current = true;
                    f.onChange(e.target.value);
                  }}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Техническое имя поля (для выгрузок и API). Только латиница,
              цифры, подчёркивания.
            </p>
            {formState.errors.key ? (
              <p className="text-sm text-destructive">
                {formState.errors.key.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="field-help-text">Подсказка</Label>
            <Textarea
              id="field-help-text"
              rows={2}
              placeholder="Необязательно — пояснение или пример, которые увидит тот, кто заполняет паспорт"
              {...register('helpText')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Тип поля</Label>
            <Controller
              control={control}
              name="type"
              render={({ field: f }) => (
                <Select value={f.value} onValueChange={f.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {type === 'TEXT' ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label>Это IP-адрес</Label>
                <p className="text-xs text-muted-foreground">
                  При заполнении паспорта введённое значение сверяется со
                  списком IP-адресов в IPAM — если адреса там нет, рядом с
                  полем покажется предупреждение. Само значение
                  по-прежнему хранится как текст, сохранить паспорт можно
                  и с адресом, которого нет в IPAM.
                </p>
              </div>
              <Controller
                control={control}
                name="validateAsIp"
                render={({ field: f }) => (
                  <Switch checked={f.value} onCheckedChange={f.onChange} />
                )}
              />
            </div>
          ) : null}

          {type === 'SELECT' ? (
            <div className="space-y-2 rounded-md border p-3">
              <Label>Варианты выбора</Label>
              {optionsArray.fields.map((f, index) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Input
                    placeholder={`Вариант ${index + 1}`}
                    {...register(`options.${index}.value` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => optionsArray.remove(index)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Удалить вариант</span>
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => optionsArray.append({ value: '' })}
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Добавить вариант
              </Button>
            </div>
          ) : null}

          {type === 'TABLE' ? (
            <div className="space-y-2 rounded-md border p-3">
              <Label>Столбцы таблицы</Label>
              {columnsArray.fields.map((f, index) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2"
                >
                  <Controller
                    control={control}
                    name={`tableColumns.${index}.label` as const}
                    render={({ field: f2 }) => (
                      <Input
                        placeholder="Подпись"
                        value={f2.value}
                        onChange={(e) => {
                          f2.onChange(e.target.value);
                          // Read/write the whole array through the static
                          // 'tableColumns' path rather than a dynamic
                          // `tableColumns.${index}.key` one — keeps this
                          // fully typed without leaning on react-hook-form's
                          // template-literal path inference.
                          const columns = getValues('tableColumns');
                          if (!columns[index]?.key) {
                            const next = [...columns];
                            next[index] = {
                              ...next[index],
                              key: slugify(e.target.value),
                            };
                            setValue('tableColumns', next);
                          }
                        }}
                      />
                    )}
                  />
                  <Input
                    placeholder="ключ"
                    className="font-mono text-sm"
                    {...register(`tableColumns.${index}.key` as const)}
                  />
                  <Controller
                    control={control}
                    name={`tableColumns.${index}.type` as const}
                    render={({ field: f2 }) => (
                      <Select value={f2.value} onValueChange={f2.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TABLE_COLUMN_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {FIELD_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => columnsArray.remove(index)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Удалить столбец</span>
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  columnsArray.append({ key: '', label: '', type: 'TEXT' })
                }
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Добавить столбец
              </Button>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>Обязательное поле</Label>
              <p className="text-xs text-muted-foreground">
                Нельзя сохранить паспорт без заполнения.
              </p>
            </div>
            <Controller
              control={control}
              name="required"
              render={({ field: f }) => (
                <Switch checked={f.value} onCheckedChange={f.onChange} />
              )}
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Видно всем ролям</Label>
                <p className="text-xs text-muted-foreground">
                  Если выключить — поле увидят только выбранные ниже роли.
                </p>
              </div>
              <Controller
                control={control}
                name="visibleToAll"
                render={({ field: f }) => (
                  <Switch checked={f.value} onCheckedChange={f.onChange} />
                )}
              />
            </div>
            {!visibleToAll ? (
              <div className="space-y-1.5 pt-1">
                {passportRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Нет ролей паспортов для выбора.
                  </p>
                ) : (
                  passportRoles.map((role) => (
                    <Controller
                      key={role.id}
                      control={control}
                      name="visibleRoleIds"
                      render={({ field: f }) => {
                        const checked = f.value.includes(role.id);
                        return (
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                if (v) {
                                  f.onChange([...f.value, role.id]);
                                } else {
                                  f.onChange(
                                    f.value.filter((id) => id !== role.id),
                                  );
                                }
                              }}
                            />
                            {role.name}
                          </label>
                        );
                      }}
                    />
                  ))
                )}
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
                'Добавить поле'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
