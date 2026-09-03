import Link from 'next/link';
import { format } from 'date-fns';
import { History, Pencil, Share2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  OBJECT_INSTANCE_STATUS_LABELS,
  OBJECT_INSTANCE_STATUS_BADGE_VARIANT,
  type ObjectInstanceStatusValue,
  type PassportHistoryEntry,
  type PassportView,
} from '@/app/(app)/passports/types';
import type { IncomingReference } from '@/app/(app)/passports/actions';
import type { TableColumnDef } from '@/app/(app)/object-types/types';
import { RELATIONSHIP_TYPE_LABELS } from '@/app/(app)/object-types/types';

// Fields come back from getPassportView() already ordered globally and
// already filtered to what the viewer is allowed to see; group into
// contiguous runs by sectionName purely for display, same as the form
// builder and the fill form.
function groupBySection<T extends { sectionName: string | null }>(items: T[]) {
  const groups: { sectionName: string | null; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.sectionName === item.sectionName) {
      last.items.push(item);
    } else {
      groups.push({ sectionName: item.sectionName, items: [item] });
    }
  }
  return groups;
}

function formatFieldValue(type: string, value: unknown): ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span className="text-muted-foreground">не заполнено</span>;
  }
  if (type === 'BOOLEAN') {
    return (
      <Badge variant={value === true ? 'default' : 'outline'}>
        {value === true ? 'Да' : 'Нет'}
      </Badge>
    );
  }
  if (type === 'DATE' && typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : format(d, 'dd.MM.yyyy');
  }
  if (type === 'LINK' && typeof value === 'string') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-primary hover:underline"
      >
        {value}
      </a>
    );
  }
  if (type === 'AUTO_IDENTIFIER' && typeof value === 'string') {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{value}</code>
    );
  }
  if (type === 'RACK_POSITION' && typeof value === 'string') {
    const [start, size] = value.split(':').map((n) => Number(n));
    if (Number.isFinite(start) && Number.isFinite(size) && size > 0) {
      const end = start + size - 1;
      return (
        <span>
          Юнит {size > 1 ? `${start}–${end}` : start} ({size}U)
        </span>
      );
    }
    return <span>{value}</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  );
}

interface PassportViewCardProps {
  data: PassportView;
  incomingReferences?: IncomingReference[];
  history?: PassportHistoryEntry[];
}

export function PassportViewCard({
  data,
  incomingReferences = [],
  history = [],
}: PassportViewCardProps) {
  const groups = groupBySection(data.fields);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Тип: <span className="text-foreground">{data.objectType.name}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Статус:{' '}
            <Badge
              variant={
                OBJECT_INSTANCE_STATUS_BADGE_VARIANT[
                  data.status as ObjectInstanceStatusValue
                ]
              }
            >
              {
                OBJECT_INSTANCE_STATUS_LABELS[
                  data.status as ObjectInstanceStatusValue
                ]
              }
            </Badge>
          </p>
          <p className="text-sm text-muted-foreground">
            Ответственные:{' '}
            <span className="text-foreground">
              {data.responsible.length > 0
                ? data.responsible
                    .map((r) => r.user.fullName || r.user.email)
                    .join(', ')
                : 'не назначены'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/passports/${data.id}/impact`}>
              <Share2 className="mr-2 h-4 w-4" />
              Impact-анализ
            </Link>
          </Button>
          {data.canEdit ? (
            <Button asChild variant="outline">
              <Link href={`/passports/${data.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Редактировать
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {groups.map((group, groupIndex) => (
        <Card key={groupIndex}>
          <CardHeader>
            <CardTitle className="text-base">
              {group.sectionName ?? 'Общие поля'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.items.map((field) => (
              <div key={field.id} className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {field.label}
                </p>
                {field.type === 'TABLE' ? (
                  <PassportTableView
                    columns={
                      Array.isArray(field.tableColumns)
                        ? (field.tableColumns as unknown as TableColumnDef[])
                        : []
                    }
                    rows={data.tableRows.filter(
                      (r) => r.fieldDefinitionId === field.id,
                    )}
                  />
                ) : (
                  <div>
                    {formatFieldValue(field.type, data.values[field.key])}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {data.fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Нет полей, доступных для просмотра с вашей ролью.
        </p>
      ) : null}

      <IncomingReferencesCard references={incomingReferences} />
      <PassportHistoryCard history={history} />
    </div>
  );
}

// Structured change history (2 September 2026, CMDB phase 7) — see
// getPassportHistory() in actions.ts and change-log-utils.ts. Newest first;
// each entry shows who changed what, not just that a change happened.
function PassportHistoryCard({ history }: { history: PassportHistoryEntry[] }) {
  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          История изменений
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="space-y-1.5 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <p className="text-sm">
              <span className="font-medium text-foreground">
                {entry.actorEmail ?? 'Неизвестный пользователь'}
              </span>{' '}
              <span className="text-muted-foreground">
                {entry.action === 'CREATE' ? 'создал(а) КЕ' : 'изменил(а) КЕ'} —{' '}
                {format(entry.createdAt, 'dd.MM.yyyy HH:mm')}
              </span>
            </p>
            {entry.changes.length > 0 ? (
              <ul className="space-y-0.5 pl-1 text-sm">
                {entry.changes.map((c, i) => (
                  <li key={`${entry.id}-${c.key}-${i}`}>
                    <span className="text-muted-foreground">{c.label}:</span>{' '}
                    <span>{c.from}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span>{c.to}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Reciprocal half of OBJECT_REFERENCE (1 September 2026, CMDB phase 6) — the
// existing fields above only ever show this passport's own outgoing links;
// this shows who else points AT it, grouped by relationship type so
// "Зависит от" (things that would break if this one did) reads separately
// from a looser "Связан с". See it-passports-design.md section 8.9.
function IncomingReferencesCard({
  references,
}: {
  references: IncomingReference[];
}) {
  if (references.length === 0) return null;

  const groups = new Map<string, IncomingReference[]>();
  for (const ref of references) {
    const key = ref.relationshipType ?? 'ASSOCIATION';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ref);
  }
  // Stable, meaningful order — DEPENDENCY first (the kind that matters most
  // for "what breaks if I do"), IMPACT last (explicit, hand-asserted).
  const order = [
    'DEPENDENCY',
    'IMPACT',
    'CONTAINMENT',
    'OWNERSHIP',
    'ASSOCIATION',
  ];
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Связанные объекты — ссылаются на эту КЕ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedGroups.map(([relType, refs]) => (
          <div key={relType} className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">
              {RELATIONSHIP_TYPE_LABELS[
                relType as keyof typeof RELATIONSHIP_TYPE_LABELS
              ] ?? relType}
            </p>
            <ul className="space-y-1">
              {refs.map((ref, i) => (
                <li key={`${ref.sourceId}-${i}`} className="text-sm">
                  <Link
                    href={`/passports/${ref.sourceId}`}
                    className="text-primary hover:underline"
                  >
                    {ref.sourceName}
                  </Link>{' '}
                  <span className="text-muted-foreground">
                    ({ref.sourceTypeName}, поле «{ref.fieldLabel}»)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PassportTableView({
  columns,
  rows,
}: {
  columns: TableColumnDef[];
  rows: PassportView['tableRows'];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Строк нет.</p>;
  }

  const sortedRows = [...rows].sort((a, b) => a.rowOrder - b.rowOrder);

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => {
            const cells = row.cells as unknown as Record<string, unknown>;
            return (
              <TableRow key={row.id}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {formatFieldValue(col.type, cells?.[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
