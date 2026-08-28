import Link from 'next/link';
import { format } from 'date-fns';
import { Pencil } from 'lucide-react';
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
import type { PassportView } from '@/app/(app)/passports/types';
import type { TableColumnDef } from '@/app/(app)/object-types/types';

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
  return (
    <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  );
}

interface PassportViewCardProps {
  data: PassportView;
}

export function PassportViewCard({ data }: PassportViewCardProps) {
  const groups = groupBySection(data.fields);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Тип: <span className="text-foreground">{data.objectType.name}</span>
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
        {data.canEdit ? (
          <Button asChild variant="outline">
            <Link href={`/passports/${data.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Редактировать
            </Link>
          </Button>
        ) : null}
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
    </div>
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
