'use client';

import * as React from 'react';
import { Hash, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

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
import { EquipmentTypeCodeFormDialog } from '@/app/(app)/equipment-type-codes/equipment-type-code-form-dialog';
import { DeleteEquipmentTypeCodeDialog } from '@/app/(app)/equipment-type-codes/delete-equipment-type-code-dialog';

export type EquipmentTypeCodeRow = {
  id: string;
  code: string;
  label: string;
  order: number;
  _count: { fields: number };
};

interface EquipmentTypeCodesTableProps {
  codes: EquipmentTypeCodeRow[];
}

export function EquipmentTypeCodesTable({
  codes,
}: EquipmentTypeCodesTableProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] =
    React.useState<EquipmentTypeCodeRow | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<EquipmentTypeCodeRow | null>(null);

  const newButton = (
    <Button
      onClick={() => {
        setEditTarget(null);
        setFormOpen(true);
      }}
    >
      <Plus className="mr-2 h-4 w-4" />
      Добавить код
    </Button>
  );

  const dialogs = (
    <>
      <EquipmentTypeCodeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        code={editTarget}
      />
      <DeleteEquipmentTypeCodeDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        code={deleteTarget}
      />
    </>
  );

  if (codes.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Hash className="h-6 w-6" />}
          title="Нет кодов оборудования"
          description="Добавьте коды из таблицы 2 инструкции по идентификации объектов — они понадобятся при настройке полей «Составной идентификатор»."
          action={newButton}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{newButton}</div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Код</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Используется в полях</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.map((code) => (
              <TableRow key={code.id}>
                <TableCell className="font-mono">{code.code}</TableCell>
                <TableCell>{code.label}</TableCell>
                <TableCell>
                  {code._count.fields > 0 ? (
                    <Badge variant="outline">{code._count.fields}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditTarget(code);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Изменить
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(code)}
                        className="text-destructive"
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
      {dialogs}
    </div>
  );
}
