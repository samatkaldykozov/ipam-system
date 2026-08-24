import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, isPassportAdmin } from '@/lib/auth';
import { getObjectTypes } from '@/app/(app)/object-types/actions';
import { ObjectTypesTable } from '@/app/(app)/object-types/object-types-table';

export const dynamic = 'force-dynamic';

// Admin's landing page for the form builder (docs/it-passports-design.md
// plan step 3): create/edit/delete object types here, then click into one
// to manage its fields (app/(app)/object-types/[id]/page.tsx).
export default async function ObjectTypesPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !isPassportAdmin(currentUser.passportRole)) {
    redirect('/');
  }

  const objectTypes = await getObjectTypes();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Конструктор форм"
        description="Создавайте типы ИТ-объектов и их поля — Паспорт КИС, Паспорт БД, ЦОД, ДГУ и любые другие."
      />
      <Card>
        <CardHeader>
          <CardTitle>Типы объектов</CardTitle>
        </CardHeader>
        <CardContent>
          <ObjectTypesTable objectTypes={objectTypes} />
        </CardContent>
      </Card>
    </div>
  );
}
