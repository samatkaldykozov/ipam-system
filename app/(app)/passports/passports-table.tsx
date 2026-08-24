'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  FileStack,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/empty-state';
import { DeletePassportDialog } from '@/app/(app)/passports/delete-passport-dialog';
import type { PassportListItem } from '@/app/(app)/passports/types';

interface PassportsTableProps {
  items: PassportListItem[];
  canEdit: boolean;
}

export function PassportsTable({ items, canEdit }: PassportsTableProps) {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('ALL');
  const [deleteTarget, setDeleteTarget] = React.useState<PassportListItem | null>(
    null,
  );

  const types = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const item of items) {
      map.set(item.objectType.id, {
        id: item.objectType.id,
        name: item.objectType.name,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'ALL' && item.objectType.id !== typeFilter) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q);
    });
  }, [items, search, typeFilter]);

  const newButton = canEdit ? (
    <Button asChild>
      <Link href="/passports/new">
        <Plus className="mr-2 h-4 w-4" />
        Новый паспорт
      </Link>
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {types.length > 0 ? (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Все типы</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        {newButton}
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Ответственные</TableHead>
                <TableHead>Обновлён</TableHead>
                {canEdit ? (
                  <TableHead className="w-[60px] text-right">Действия</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <Link href={`/passports/${item.id}`} className="hover:underline">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.objectType.name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.responsible.length > 0
                      ? item.responsible
                          .map((r) => r.user.fullName || r.user.email)
                          .join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(item.updatedAt, 'MMM d, yyyy')}
                  </TableCell>
                  {canEdit ? (
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
                            <Link href={`/passports/${item.id}/edit`}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Редактировать
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<FileStack className="h-6 w-6" />}
          title={
            items.length === 0
              ? 'Пока нет ни одного паспорта'
              : 'Ничего не найдено'
          }
          description={
            items.length === 0
              ? canEdit
                ? 'Создайте первый паспорт.'
                : 'Обратитесь к Passport Admin или Passport Manager.'
              : 'Попробуйте изменить условия поиска.'
          }
          action={items.length === 0 && newButton ? newButton : undefined}
        />
      )}

      <DeletePassportDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        passport={deleteTarget}
      />
    </div>
  );
}
