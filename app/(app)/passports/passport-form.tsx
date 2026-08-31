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
  searchLocationsForReference,
  searchObjectInstancesForReference,
  getObjectReferenceLabels,
} from '@/app/(app)/passports/actions';
import type {
  ObjectTypeForFill,
  PassportUserOption,
  PassportWithFields,
} from '@/app/(app)/passports/types';
import type { IpAddressSuggestion } from '@/app/(app)/passports/actions';
import type { IpAddressRefLabel } from '@/app/(app)/passports/ip-reference-utils';
import type { ObjectReferenceLabel } from '@/app/(app)/passports/object-reference-utils';
import type { TableColumnDef } from '@/app/(app)/object-types/types';

// One search result for ObjectReferenceField below, normalized from either
// LocationReferenceSuggestion or ObjectInstanceReferenceSuggestion (see
// actions.ts) so the field component itself doesn't need to know which
// kind it's browsing.
type ReferenceSuggestion = { id: string; title: string; subtitle: string };

// Builds the right search function for one OBJECT_REFERENCE field/column,
// based on its admin-configured target — LOCATION searches the whole
// Location tree, OBJECT_TYPE searches only passports of the configured
// type. Kept outside the component so it's cheap to recreate per render
// without needing a useCallback/useMemo.
function objectReferenceSearcher(
  targetKind: string | null | undefined,
  referenceObjectTypeId: string | null | undefined,
): (prefix: string) => Promise<ReferenceSuggestion[]> {
  if (targetKind === 'LOCATION') {
    return async (prefix) => {
      const found = await searchLocationsForReference(prefix);
      return found.map((l) => ({
        id: l.id,
        title: l.name,
        subtitle: [l.kind, l.parentName].filter(Boolean).join(' · '),
      }));
    };
  }
  // Null means "any object type" (31 August 2026, CMDB phase 5) — passed
  // straight through to the unscoped search rather than short-circuiting
  // to an empty result the way an actually-missing config would.
  const objectTypeId = referenceObjectTypeId || null;
  return async (prefix) => {
    const found = await searchObjectInstancesForReference(objectTypeId, prefix);
    return found.map((i) => ({
      id: i.id,
      title: i.name,
      subtitle: i.objectTypeName,
    }));
  };
}

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

export function PassportForm({
  objectType,
  users,
  passport,
}: PassportFormProps) {
  const router = useRouter();
  const isEdit = !!passport;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );

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
          row[k] =
            typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? '');
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

    // Same resolution one level down — a TABLE field can have a column of
    // type IP_REFERENCE too (26 August 2026), whose cells are also just a
    // bare id in tableRows state.
    for (const field of objectType.fields) {
      if (field.type !== 'TABLE') continue;
      const ipRefColumnKeys = getTableColumns(field.tableColumns)
        .filter((c) => c.type === 'IP_REFERENCE')
        .map((c) => c.key);
      if (ipRefColumnKeys.length === 0) continue;
      for (const row of tableRows[field.key] ?? []) {
        for (const key of ipRefColumnKeys) {
          if (row[key]) ids.push(row[key]);
        }
      }
    }

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

  // OBJECT_REFERENCE fields/columns store a bare Location or ObjectInstance
  // id (28 August 2026, CMDB phase 2) — same idea as ipRefLabels above,
  // generalized. Ids are split by each field's configured target kind
  // before resolving, then merged into one flat map: a random-UUID
  // collision between the Location and ObjectInstance id spaces is not a
  // realistic concern, and every consumer already knows which pool an id
  // came from via its owning field's config.
  const [objectRefLabels, setObjectRefLabels] = React.useState<
    Record<string, ObjectReferenceLabel>
  >({});

  React.useEffect(() => {
    const locationIds: string[] = [];
    const instanceIds: string[] = [];

    for (const field of objectType.fields) {
      if (field.type !== 'OBJECT_REFERENCE') continue;
      const v = values[field.key];
      if (typeof v !== 'string' || !v) continue;
      (field.referenceTargetKind === 'LOCATION'
        ? locationIds
        : instanceIds
      ).push(v);
    }

    for (const field of objectType.fields) {
      if (field.type !== 'TABLE') continue;
      const refColumns = getTableColumns(field.tableColumns).filter(
        (c) => c.type === 'OBJECT_REFERENCE',
      );
      if (refColumns.length === 0) continue;
      for (const row of tableRows[field.key] ?? []) {
        for (const col of refColumns) {
          const v = row[col.key];
          if (!v) continue;
          (col.referenceTargetKind === 'LOCATION'
            ? locationIds
            : instanceIds
          ).push(v);
        }
      }
    }

    if (locationIds.length === 0 && instanceIds.length === 0) return;
    let cancelled = false;
    getObjectReferenceLabels(locationIds, instanceIds).then(
      ({ locations, instances }) => {
        if (!cancelled) {
          setObjectRefLabels((prev) => ({
            ...prev,
            ...locations,
            ...instances,
          }));
        }
      },
    );
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
    const list: {
      sectionName: string | null;
      fields: typeof objectType.fields;
    }[] = [];
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

    const payloadTableRows: Record<
      string,
      { cells: Record<string, unknown> }[]
    > = {};
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

    toast.success(
      result.message ?? (isEdit ? 'Паспорт обновлён' : 'Паспорт создан'),
    );
    router.push(
      isEdit
        ? `/passports/${passport!.id}`
        : newId
          ? `/passports/${newId}`
          : '/passports',
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
                ) : field.type === 'OBJECT_REFERENCE' ? (
                  <ObjectReferenceField
                    value={(values[field.key] as string) ?? ''}
                    onChange={(v) => setFieldValue(field.key, v)}
                    initialLabel={
                      objectRefLabels[(values[field.key] as string) ?? '']
                    }
                    search={objectReferenceSearcher(
                      field.referenceTargetKind,
                      field.referenceObjectTypeId,
                    )}
                  />
                ) : field.type === 'AUTO_IDENTIFIER' ? (
                  <Input
                    disabled
                    className="font-mono text-muted-foreground"
                    value={
                      (values[field.key] as string) ||
                      'будет присвоено после сохранения'
                    }
                  />
                ) : field.type === 'RACK_POSITION' ? (
                  <RackPositionField
                    value={(values[field.key] as string) ?? ''}
                    onChange={(v) => setFieldValue(field.key, v)}
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
                    ipRefLabels={ipRefLabels}
                    objectRefLabels={objectRefLabels}
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
              <p className="text-sm text-muted-foreground">
                Никого не найдено.
              </p>
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
          Такого IP-адреса нет в IPAM — проверьте значение (сохранить всё равно
          можно).
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
// OBJECT_REFERENCE field — hard link to a Location node or another
// passport (28 August 2026, CMDB phase 2 — see FieldType.OBJECT_REFERENCE
// in schema.prisma), generalizing IpReferenceField above from IpAddress
// targets to any CMDB object. Same "no free-text fallback" shape: the only
// way to set it is picking a real result from the `search` function the
// caller supplies (see objectReferenceSearcher above), which already
// knows which pool (Location tree, or one ObjectType's passports) to
// search based on this field's admin-configured target.
// ─────────────────────────────────────────────

function ObjectReferenceField({
  value,
  onChange,
  initialLabel,
  search,
}: {
  value: string;
  onChange: (id: string) => void;
  initialLabel?: ObjectReferenceLabel;
  search: (prefix: string) => Promise<ReferenceSuggestion[]>;
}) {
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<ReferenceSuggestion[]>(
    [],
  );
  const [focused, setFocused] = React.useState(false);
  const [selected, setSelected] = React.useState<ReferenceSuggestion | null>(
    initialLabel
      ? {
          id: initialLabel.id,
          title: initialLabel.title,
          subtitle: initialLabel.subtitle,
        }
      : null,
  );

  React.useEffect(() => {
    if (initialLabel && initialLabel.id === value) {
      setSelected({
        id: initialLabel.id,
        title: initialLabel.title,
        subtitle: initialLabel.subtitle,
      });
    }
  }, [initialLabel, value]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await search(trimmed);
      if (!cancelled) setSuggestions(found);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  function pick(s: ReferenceSuggestion) {
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
          <p className="text-sm font-medium">{selected.title}</p>
          {selected.subtitle ? (
            <p className="text-xs text-muted-foreground">{selected.subtitle}</p>
          ) : null}
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
        placeholder="Начните вводить название…"
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
              <span className="font-medium">{s.title}</span>
              {s.subtitle ? (
                <span className="text-xs text-muted-foreground">
                  {s.subtitle}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {focused && query.trim() && suggestions.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Совпадений не найдено.
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────
// RACK_POSITION field — two plain number inputs (start unit, height in U),
// combined into/parsed from the "{startUnit}:{sizeUnits}" string stored in
// values[field.key] (see rackPositionValueRegex in lib/validations.ts).
// Units are numbered from the bottom of the rack (unit 1 = lowest), the
// common datacenter convention — see the rack-elevation page, which
// renders on the same assumption.
// ─────────────────────────────────────────────

function RackPositionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [startUnit, sizeUnits] = value.split(':');

  function update(nextStart: string, nextSize: string) {
    // Only emit a value once both halves look like something — an empty
    // string keeps the field genuinely empty rather than becoming "1:1" as
    // soon as either input is touched, so a required-field error still
    // reads correctly.
    if (!nextStart.trim() && !nextSize.trim()) {
      onChange('');
      return;
    }
    onChange(`${nextStart.trim()}:${nextSize.trim()}`);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Юнит (снизу, с 1)</p>
        <Input
          type="number"
          min={1}
          value={startUnit ?? ''}
          onChange={(e) => update(e.target.value, sizeUnits ?? '')}
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Высота, U</p>
        <Input
          type="number"
          min={1}
          value={sizeUnits ?? ''}
          onChange={(e) => update(startUnit ?? '', e.target.value)}
        />
      </div>
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
  // Initial labels for IP_REFERENCE columns' cells, resolved once by the
  // parent form for every IP_REFERENCE value on the passport at once (see
  // the ipRefLabels effect in PassportForm) — same idea as the regular
  // IP_REFERENCE field's initialLabel, one level down.
  ipRefLabels: Record<string, IpAddressRefLabel>;
  // Same idea, one level down, for OBJECT_REFERENCE columns (28 August
  // 2026) — see the objectRefLabels effect in PassportForm.
  objectRefLabels: Record<string, ObjectReferenceLabel>;
}

function TableFieldEditor({
  label,
  helpText,
  columns,
  rows,
  onAddRow,
  onRemoveRow,
  onCellChange,
  ipRefLabels,
  objectRefLabels,
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
                      ) : col.type === 'IP_REFERENCE' ? (
                        <IpReferenceField
                          value={row[col.key] ?? ''}
                          onChange={(v) => onCellChange(index, col.key, v)}
                          initialLabel={ipRefLabels[row[col.key] ?? '']}
                        />
                      ) : col.type === 'OBJECT_REFERENCE' ? (
                        <ObjectReferenceField
                          value={row[col.key] ?? ''}
                          onChange={(v) => onCellChange(index, col.key, v)}
                          initialLabel={objectRefLabels[row[col.key] ?? '']}
                          search={objectReferenceSearcher(
                            col.referenceTargetKind,
                            col.referenceObjectTypeId,
                          )}
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
