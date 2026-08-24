import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LayoutTemplate } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { getCurrentUser, canEditPassports } from '@/lib/auth';
import { getObjectTypesForPicker } from '@/app/(app)/passports/actions';

export const dynamic = 'force-dynamic';

// Step one of creating a passport: pick which object type it's an
// instance of. The actual fill form lives at /passports/new/[objectTypeId]
// (app/(app)/passports/new/[objectTypeId]/page.tsx), rendered dynamically
// from that type's FieldDefinition list.
export default async function NewPassportPickerPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    redirect('/passports');
  }

  const objectTypes = await getObjectTypesForPicker();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Новый паспорт"
        description="Выберите тип ИТ-объекта, для которого создаётся паспорт."
      />
      {objectTypes.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title="Пока нет ни одного типа объекта"
          description="Сначала создайте тип и его поля в конструкторе форм."
          action={
            <Link
              href="/object-types"
              className="text-sm font-medium text-primary hover:underline"
            >
              Перейти в конструктор форм
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {objectTypes.map((ot) => (
            <Link key={ot.id} href={`/passports/new/${ot.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle className="text-base">{ot.name}</CardTitle>
                  <CardDescription>
                    {ot.description || `Код: ${ot.code}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{ot._count.fields} поле(й)</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
