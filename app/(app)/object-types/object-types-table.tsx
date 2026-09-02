'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/empty-state';
import { ObjectTypeFormDialog } from '@/app/(app)/object-types/object-type-form-dialog';
import { DeleteObjectTypeDialog } from '@/app/(app)/object-types/delete-object-type-dialog';
import type { ObjectTypeWithCounts } from '@/app/(app)/object-types/types';

interface ObjectTypesTableProps {
  objectTypes: ObjectTypeWithCounts[];
}

export function ObjectTypesTable({ objectTypes }: ObjectTypesTableProps) {
  const [search, setSearch] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] =
    React.useState<ObjectTypeWithCounts | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<ObjectTypeWithCounts | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return objectTypes;
    return objectTypes.filter(
      (ot) =>
        ot.name.toLowerCase().includes(q) ||
        ot.code.toLowerCase().includes(q) ||
        (ot.description ?? '').toLowerCase().includes(q),
    );
  }, [objectTypes, search]);

  const newButton = (
    <Button
      onClick={() => {
        setEditTarget(null);
        setFormOpen(true);
      }}
    >
      <Plus className="mr-2 h-4 w-4" />
      Новый тип объекта
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, коду…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {newButton}
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Код</TableHead>
                <TableHead className="max-w-[280px]">Описание</TableHead>
                <TableHead>Поля</TableHead>
                <TableHead>КЕ</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead className="w-[60px] text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ot) => (
                <TableRow key={ot.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/object-types/${ot.id}`}
                      className="hover:underline"
                    >
                      {ot.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {ot.code}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                    {ot.description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ot._count.fields}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ot._count.instances}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(ot.createdAt, 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Открыть действия</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Действия</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/object-types/${ot.id}`}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            Настроить поля
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditTarget(ot);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(ot)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title={
            objectTypes.length === 0
              ? 'Пока нет ни одного типа объекта'
              : 'Ничего не найдено'
          }
          description={
            objectTypes.length === 0
              ? 'Создайте первый тип КЕ — например, «Паспорт КИС» или «Паспорт БД».'
              : 'Попробуйте изменить условия поиска.'
          }
          action={objectTypes.length === 0 ? newButton : undefined}
        />
      )}

      <ObjectTypeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        objectType={editTarget}
      />
      <DeleteObjectTypeDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        objectType={deleteTarget}
      />
    </div>
  );
}
