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
import {
  createPassport,
  updatePassport,
  checkIpAddressKnown,
  searchIpAddresses,
  getIpAddressLabels,
} from '@/app/(app)/passports/actions';
import type {
  ObjectTypeForFill,
  PassportUserOption,
  PassportWithFields,
} from '@/app/(app)/passports/types';
import type { IpAddressSuggestion } from '@/app/(app)/passports/actions';
import type { IpAddressRefLabel } from '@/app/(app)/passports/ip-reference-utils';
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

  // IP_REFERENCE fields store just an IpAddress id in `values` — resolve
  // the initial (persisted) ids to display labels once on mount, since
  // the picker below has no way to show "10.0.0.5" for a bare uuid on its
  // own. Newly-picked values fill in their own label locally (see
  // IpReferenceField), so this only ever needs to run once.
  const [ipRefLabels, setIpRefLabels] = React.useState<
    Record<string, IpAddressRefLabel>
  >({});

  React.useEffect(() => {
    const ids = objectType.fields
      .filter((f) => f.type === 'IP_REFERENCE')
      .map((f) => values[f.key])
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) return;
    let cancelled = false;
    getIpAddressLabels(ids).then((map) => {
      if (!cancelled) setIpRefLabels((prev) => ({ ...prev, ...map }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  <>
                    <Label>
                      {field.label}
                      {field.required ? (
                        <span className="text-destructive"> *</span>
                      ) : null}
                    </Label>
                    {field.helpText ? (
                      <p className="text-xs text-muted-foreground">
                        {field.helpText}
                      </p>
                    ) : null}
                  </>
                ) : null}

                {field.type === 'TEXT' ? (
                  field.validateAsIp ? (
                    <IpAddressField
                      value={(values[field.key] as string) ?? ''}
                      onChange={(v) => setFieldValue(field.key, v)}
                    />
                  ) : (
                    <Input
                      value={(values[field.key] as string) ?? ''}
                      onChange={(e) => setFieldValue(field.key, e.target.value)}
                    />
                  )
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
                    <div className="space-y-0.5">
                      <Label>
                        {field.label}
                        {field.required ? (
                          <span className="text-destructive"> *</span>
                        ) : null}
                      </Label>
                      {field.helpText ? (
                        <p className="text-xs text-muted-foreground">
                          {field.helpText}
                        </p>
                      ) : null}
                    </div>
                    <Switch
                      checked={(values[field.key] as boolean) ?? false}
                      onCheckedChange={(v) => setFieldValue(field.key, v)}
                    />
                  </div>
                ) : field.type === 'IP_REFERENCE' ? (
                  <IpReferenceField
                    value={(values[field.key] as string) ?? ''}
                    onChange={(v) => setFieldValue(field.key, v)}
                    initialLabel={
                      ipRefLabels[(values[field.key] as string) ?? '']
                    }
                  />
                ) : field.type === 'TABLE' ? (
                  <TableFieldEditor
                    label={field.label}
                    helpText={field.helpText}
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
// Soft "Это IP-адрес" field — see FieldDefinition.validateAsIp in
// schema.prisma. Two debounced, non-blocking helpers layered on a plain
// text input:
//   - an autocomplete dropdown suggesting real addresses from IPAM that
//     start with what's typed (click/select fills the field);
//   - an advisory warning under the field when the typed value doesn't
//     match any known address — never prevents saving the passport.
// The field's stored value is still plain text either way (see
// checkIpAddressKnown/searchIpAddresses in actions.ts). Isolated into its
// own component (rather than a shared dictionary of per-field timers on
// PassportForm) so each field's debounce/effect is independent.
// ─────────────────────────────────────────────

function IpAddressField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [status, setStatus] = React.useState<
    'idle' | 'checking' | 'known' | 'unknown'
  >('idle');
  const [suggestions, setSuggestions] = React.useState<IpAddressSuggestion[]>(
    [],
  );
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus('idle');
      setSuggestions([]);
      return;
    }
    setStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [known, found] = await Promise.all([
        checkIpAddressKnown(trimmed),
        searchIpAddresses(trimmed),
      ]);
      if (cancelled) return;
      setStatus(known ? 'known' : 'unknown');
      setSuggestions(found);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  // Nothing useful to suggest once the field already exactly matches the
  // one known address — hide the dropdown rather than "suggesting" what's
  // already typed (this is also what makes it close right after a click).
  const trimmedValue = value.trim();
  const relevantSuggestions =
    suggestions.length === 1 && suggestions[0].address === trimmedValue
      ? []
      : suggestions;
  const showDropdown = focused && relevantSuggestions.length > 0;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />
      {showDropdown ? (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {relevantSuggestions.map((s) => (
            <button
              key={s.address}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                // onMouseDown (not onClick) so this fires before the
                // input's onBlur would otherwise close the dropdown first.
                e.preventDefault();
                onChange(s.address);
              }}
            >
              <span className="font-medium">{s.address}</span>
              <span className="text-xs text-muted-foreground">
                {[s.hostname, s.networkLabel].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {status === 'unknown' ? (
        <p className="mt-1.5 text-xs text-amber-600">
          Такого IP-адреса нет в IPAM — проверьте значение (сохранить всё равно можно).
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────
// IP_REFERENCE field — hard link to a real IpAddress row (see
// FieldType.IP_REFERENCE in schema.prisma). Unlike IpAddressField above,
// there's no free-text fallback: the stored value is the address's id, so
// the only way to set it is picking a real result from search. `selected`
// holds the currently-chosen address's display info; `initialLabel` seeds
// it in edit mode, resolved once by the parent form for every
// IP_REFERENCE field at once (see the ipRefLabels effect in PassportForm).
// ─────────────────────────────────────────────

function IpReferenceField({
  value,
  onChange,
  initialLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  initialLabel?: IpAddressRefLabel;
}) {
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<IpAddressSuggestion[]>(
    [],
  );
  const [focused, setFocused] = React.useState(false);
  const [selected, setSelected] = React.useState<IpAddressRefLabel | null>(
    initialLabel ?? null,
  );

  // initialLabel arrives asynchronously — pick it up as soon as it
  // resolves, as long as it still matches the value we're holding (guards
  // against clobbering a fresh pick if this fires late).
  React.useEffect(() => {
    if (initialLabel && initialLabel.id === value) setSelected(initialLabel);
  }, [initialLabel, value]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchIpAddresses(trimmed);
      if (!cancelled) setSuggestions(found);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function pick(s: IpAddressSuggestion) {
    setSelected(s);
    setQuery('');
    setFocused(false);
    onChange(s.id);
  }

  function changeSelection() {
    setSelected(null);
    setQuery('');
    onChange('');
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <div>
          <p className="text-sm font-medium">{selected.address}</p>
          <p className="text-xs text-muted-foreground">
            {[selected.hostname, selected.networkLabel]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={changeSelection}
        >
          Изменить
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Начните вводить адрес из IPAM…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />
      {focused && suggestions.length > 0 ? (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                // onMouseDown (not onClick) so this fires before the
                // input's onBlur would otherwise close the dropdown first.
                e.preventDefault();
                pick(s);
              }}
            >
              <span className="font-medium">{s.address}</span>
              <span className="text-xs text-muted-foreground">
                {[s.hostname, s.networkLabel].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {focused && query.trim() && suggestions.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Совпадений в IPAM не найдено.
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────
// TABLE-type field row editor
// ─────────────────────────────────────────────

interface TableFieldEditorProps {
  label: string;
  helpText?: string | null;
  columns: TableColumnDef[];
  rows: TableRowState[];
  onAddRow: (columns: TableColumnDef[]) => void;
  onRemoveRow: (index: number) => void;
  onCellChange: (index: number, columnKey: string, value: string) => void;
}

function TableFieldEditor({
  label,
  helpText,
  columns,
  rows,
  onAddRow,
  onRemoveRow,
  onCellChange,
}: TableFieldEditorProps) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{label}</Label>
          {helpText ? (
            <p className="text-xs text-muted-foreground">{helpText}</p>
          ) : null}
        </div>
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
                      ) : col.type === 'TEXT' && col.validateAsIp ? (
                        <IpAddressField
                          value={row[col.key] ?? ''}
                          onChange={(v) => onCellChange(index, col.key, v)}
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
