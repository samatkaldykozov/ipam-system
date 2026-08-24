'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { Role } from '@prisma/client';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/empty-state';
import { moveFieldDefinition } from '@/app/(app)/object-types/actions';
import { FieldFormDialog } from '@/app/(app)/object-types/[id]/field-form-dialog';
import { DeleteFieldDialog } from '@/app/(app)/object-types/[id]/delete-field-dialog';
import {
  FIELD_TYPE_LABELS,
  type FieldDefinitionWithVisibility,
} from '@/app/(app)/object-types/types';

interface FieldsBuilderProps {
  objectTypeId: string;
  fields: FieldDefinitionWithVisibility[];
  passportRoles: Role[];
}

// Fields come back ordered globally by `order`; group into contiguous runs
// by sectionName so the UI mirrors how the source documents were laid out
// (numbered sections, each with its own fields), without needing a
// separate "section" entity in the data model — see
// docs/it-passports-design.md section 1.
function groupBySection(fields: FieldDefinitionWithVisibility[]) {
  const groups: {
    sectionName: string | null;
    fields: FieldDefinitionWithVisibility[];
  }[] = [];
  for (const field of fields) {
    const last = groups[groups.length - 1];
    if (last && last.sectionName === field.sectionName) {
      last.fields.push(field);
    } else {
      groups.push({ sectionName: field.sectionName, fields: [field] });
    }
  }
  return groups;
}

export function FieldsBuilder({
  objectTypeId,
  fields,
  passportRoles,
}: FieldsBuilderProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] =
    React.useState<FieldDefinitionWithVisibility | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<FieldDefinitionWithVisibility | null>(null);
  const [movingId, setMovingId] = React.useState<string | null>(null);

  const groups = React.useMemo(() => groupBySection(fields), [fields]);

  const addButton = (
    <Button
      onClick={() => {
        setEditTarget(null);
        setFormOpen(true);
      }}
    >
      <Plus className="mr-2 h-4 w-4" />
      Добавить поле
    </Button>
  );

  async function handleMove(fieldId: string, direction: 'up' | 'down') {
    setMovingId(fieldId);
    const result = await moveFieldDefinition(fieldId, direction);
    setMovingId(null);
    if (!result.ok && result.message) {
      toast.error(result.message);
    }
  }

  const dialogs = (
    <>
      <FieldFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        objectTypeId={objectTypeId}
        field={editTarget}
        passportRoles={passportRoles}
      />
      <DeleteFieldDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        field={deleteTarget}
      />
    </>
  );

  if (fields.length === 0) {
    return (
      <>
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title="Пока нет ни одного поля"
          description="Добавьте первое поле — например, «Наименование ИС» (текст) или «Дата ввода в эксплуатацию» (дата)."
          action={addButton}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{addButton}</div>

      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {group.sectionName ?? 'Без раздела'}
          </h4>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Подпись</TableHead>
                  <TableHead>Ключ</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Обязательное</TableHead>
                  <TableHead>Видимость</TableHead>
                  <TableHead className="w-[140px] text-right">
                    Действия
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.fields.map((field) => {
                  const globalIndex = fields.findIndex((f) => f.id === field.id);
                  return (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium">{field.label}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {field.key}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {FIELD_TYPE_LABELS[field.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {field.required ? (
                          <Badge variant="outline">Да</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {field.visibleToAll ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Eye className="h-3.5 w-3.5" />
                            Всем
                          </span>
                        ) : (
                          <span
                            className="flex items-center gap-1 text-sm text-muted-foreground"
                            title={field.visibleRoles
                              .map((v) => v.role.name)
                              .join(', ')}
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                            {field.visibleRoles.length
                              ? field.visibleRoles
                                  .map((v) => v.role.name)
                                  .join(', ')
                              : 'Никому'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={globalIndex === 0 || movingId === field.id}
                            onClick={() => handleMove(field.id, 'up')}
                          >
                            <ArrowUp className="h-4 w-4" />
                            <span className="sr-only">Переместить выше</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={
                              globalIndex === fields.length - 1 ||
                              movingId === field.id
                            }
                            onClick={() => handleMove(field.id, 'down')}
                          >
                            <ArrowDown className="h-4 w-4" />
                            <span className="sr-only">Переместить ниже</span>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">
                                  Открыть действия
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditTarget(field);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Редактировать
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(field)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}

      {dialogs}
    </div>
  );
}
