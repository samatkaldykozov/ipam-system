'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createPassport, updatePassport } from '@/app/(app)/passports/actions';
import type {
  ObjectTypeForFill,
  PassportUserOption,
  PassportWithFields,
} from '@/app/(app)/passports/types';
import type { TableColumnDef } from '@/app/(app)/object-types/types';

interface PassportFormProps {
  objectType: ObjectTypeForFill;
  users: PassportUserOption[];
  passport: PassportWithFields | null;
}

// One table row's cell values, all kept as strings client-side (including
// booleans, stored as 'true'/'false') — normalized back to real types only
// when building the payload for the server action in handleSubmit.
type TableRowState = Record<string, string>;

function getTableColumns(tableColumns: unknown): TableColumnDef[] {
  return Array.isArray(tableColumns)
    ? (tableColumns as unknown as TableColumnDef[])
    : [];
}

export function PassportForm({ objectType, users, passport }: PassportFormProps) {
  const router = useRouter();
  const isEdit = !!passport;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [name, setName] = React.useState(passport?.name ?? '');

  const [values, setValues] = React.useState<Record<string, string | boolean>>(
    () => {
      const initial: Record<string, string | boolean> = {};
      if (passport) {
        const raw = passport.values as unknown as Record<string, unknown>;
        for (const field of objectType.fields) {
          if (field.type === 'TABLE') continue;
          const v = raw?.[field.key];
          if (field.type === 'BOOLEAN') {
            initial[field.key] = v === true;
          } else if (typeof v === 'string') {
            initial[field.key] = v;
          }
        }
      }
      return initial;
    },
  );

  const [tableRows, setTableRows] = React.useState<
    Record<string, TableRowState[]>
  >(() => {
    const initial: Record<string, TableRowState[]> = {};
    for (const field of objectType.fields) {
      if (field.type !== 'TABLE') continue;
      const rows = passport
        ? passport.tableRows
            .filter((r) => r.fieldDefinitionId === field.id)
            .sort((a, b) => a.rowOrder - b.rowOrder)
        : [];
      initial[field.key] = rows.map((r) => {
        const cells = r.cells as unknown as Record<string, unknown>;
        const row: TableRowState = {};
        for (const [k, v] of Object.entries(cells ?? {})) {
          row[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? '');
        }
        return row;
      });
    }
    return initial;
  });

  const [responsibleUserIds, setResponsibleUserIds] = React.useState<string[]>(
    passport?.responsible.map((r) => r.userId) ?? [],
  );
  const [userSearch, setUserSearch] = React.useState('');

  function setFieldValue(key: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function addTableRow(fieldKey: string, columns: TableColumnDef[]) {
    setTableRows((prev) => {
      const row: TableRowState = {};
      for (const col of columns) {
        row[col.key] = col.type === 'BOOLEAN' ? 'false' : '';
      }
      return { ...prev, [fieldKey]: [...(prev[fieldKey] ?? []), row] };
    });
  }

  function removeTableRow(fieldKey: string, index: number) {
    setTableRows((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] ?? []).filter((_, i) => i !== index),
    }));
  }

  function setTableCell(
    fieldKey: string,
    index: number,
    columnKey: string,
    value: string,
  ) {
    setTableRows((prev) => {
      const rows = [...(prev[fieldKey] ?? [])];
      rows[index] = { ...rows[index], [columnKey]: value };
      return { ...prev, [fieldKey]: rows };
    });
  }

  function toggleResponsible(userId: string) {
    setResponsibleUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  }

  const filteredUsers = React.useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.fullName ?? '').toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  // Fields come back ordered globally by `order`; group into contiguous
  // runs by sectionName, same as the form builder (see
  // app/(app)/object-types/[id]/fields-builder.tsx).
  const groups = React.useMemo(() => {
    const list: { sectionName: string | null; fields: typeof objectType.fields }[] =
      [];
    for (const field of objectType.fields) {
      const last = list[list.length - 1];
      if (last && last.sectionName === field.sectionName) {
        last.fields.push(field);
      } else {
        list.push({ sectionName: field.sectionName, fields: [field] });
      }
    }
    return list;
  }, [objectType.fields]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!name.trim()) {
      setFieldErrors({ name: 'Укажите название паспорта' });
      return;
    }

    const payloadTableRows: Record<string, { cells: Record<string, unknown> }[]> =
      {};
    for (const field of objectType.fields) {
      if (field.type !== 'TABLE') continue;
      const columns = getTableColumns(field.tableColumns);
      const rows = tableRows[field.key] ?? [];
      payloadTableRows[field.key] = rows.map((row) => {
        const cells: Record<string, unknown> = {};
        for (const col of columns) {
          const raw = row[col.key];
          cells[col.key] =
            col.type === 'BOOLEAN' ? raw === 'true' : (raw ?? '').trim();
        }
        return { cells };
      });
    }

    setSubmitting(true);

    let result: {
      ok: boolean;
      message?: string;
      fieldErrors?: Record<string, string>;
    };
    let newId: string | undefined;

    if (isEdit) {
      result = await updatePassport(passport!.id, {
        name,
        values,
        tableRows: payloadTableRows,
        responsibleUserIds,
      });
    } else {
      const created = await createPassport({
        objectTypeId: objectType.id,
        name,
        values,
        tableRows: payloadTableRows,
        responsibleUserIds,
      });
      result = created;
      newId = created.data?.id;
    }

    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      if (result.message && !result.fieldErrors) setError(result.message);
      return;
    }

    toast.success(result.message ?? (isEdit ? 'Паспорт обновлён' : 'Паспорт создан'));
    router.push(
      isEdit ? `/passports/${passport!.id}` : newId ? `/passports/${newId}` : '/passports',
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Название паспорта</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Input
            placeholder={`${objectType.name} — …`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {fieldErrors.name ? (
            <p className="text-sm text-destructive">{fieldErrors.name}</p>
          ) : null}
        </CardContent>
      </Card>

      {groups.map((group, groupIndex) => (
        <Card key={groupIndex}>
          <CardHeader>
            <CardTitle className="text-base">
              {group.sectionName ?? 'Общие поля'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                {field.type !== 'BOOLEAN' && field.type !== 'TABLE' ? (
                  <Label>
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </Label>
                ) : null}

                {field.type === 'TEXT' ? (
                  <Input
                    value={(values[field.key] as string) ?? ''}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                  />
                ) : field.type === 'LONG_TEXT' ? (
                  <Textarea
                    rows={4}
                    value={(values[field.key] as string) ?? ''}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                  />
                ) : field.type === 'DATE' ? (
                  <Input
                    type="date"
                    value={(values[field.key] as string) ?? ''}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                  />
                ) : field.type === 'LINK' ? (
                  <Input
                    type="url"
                    placeholder="https://…"
                    value={(values[field.key] as string) ?? ''}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                  />
                ) : field.type === 'SELECT' ? (
                  <Select
                    value={(values[field.key] as string) ?? ''}
                    onValueChange={(v) => setFieldValue(field.key, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Не выбрано" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(field.options)
                        ? (field.options as unknown as string[])
                        : []
                      ).map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === 'BOOLEAN' ? (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label>
                      {field.label}
                      {field.required ? (
                        <span className="text-destructive"> *</span>
                      ) : null}
                    </Label>
                    <Switch
                      checked={(values[field.key] as boolean) ?? false}
                      onCheckedChange={(v) => setFieldValue(field.key, v)}
                    />
                  </div>
                ) : field.type === 'TABLE' ? (
                  <TableFieldEditor
                    label={field.label}
                    columns={getTableColumns(field.tableColumns)}
                    rows={tableRows[field.key] ?? []}
                    onAddRow={(columns) => addTableRow(field.key, columns)}
                    onRemoveRow={(index) => removeTableRow(field.key, index)}
                    onCellChange={(index, columnKey, value) =>
                      setTableCell(field.key, index, columnKey, value)
                    }
                  />
                ) : null}

                {fieldErrors[field.key] ? (
                  <p className="text-sm text-destructive">
                    {fieldErrors[field.key]}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ответственные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск пользователя…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border p-3">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Никого не найдено.</p>
            ) : (
              filteredUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={responsibleUserIds.includes(u.id)}
                    onCheckedChange={() => toggleResponsible(u.id)}
                  />
                  <span>{u.fullName || u.email}</span>
                  {u.fullName ? (
                    <span className="text-muted-foreground">({u.email})</span>
                  ) : null}
                </label>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(isEdit ? `/passports/${passport!.id}` : '/passports')
          }
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
            'Создать паспорт'
          )}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────
// TABLE-type field row editor
// ─────────────────────────────────────────────

interface TableFieldEditorProps {
  label: string;
  columns: TableColumnDef[];
  rows: TableRowState[];
  onAddRow: (columns: TableColumnDef[]) => void;
  onRemoveRow: (index: number) => void;
  onCellChange: (index: number, columnKey: string, value: string) => void;
}

function TableFieldEditor({
  label,
  columns,
  rows,
  onAddRow,
  onRemoveRow,
  onCellChange,
}: TableFieldEditorProps) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAddRow(columns)}
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          Добавить строку
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Строк пока нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      {col.type === 'BOOLEAN' ? (
                        <Switch
                          checked={row[col.key] === 'true'}
                          onCheckedChange={(v) =>
                            onCellChange(index, col.key, v ? 'true' : 'false')
                          }
                        />
                      ) : col.type === 'LONG_TEXT' ? (
                        <Textarea
                          rows={2}
                          value={row[col.key] ?? ''}
                          onChange={(e) =>
                            onCellChange(index, col.key, e.target.value)
                          }
                        />
                      ) : col.type === 'DATE' ? (
                        <Input
                          type="date"
                          value={row[col.key] ?? ''}
                          onChange={(e) =>
                            onCellChange(index, col.key, e.target.value)
                          }
                        />
                      ) : (
                        <Input
                          value={row[col.key] ?? ''}
                          onChange={(e) =>
                            onCellChange(index, col.key, e.target.value)
                          }
                        />
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveRow(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Удалить строку</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
