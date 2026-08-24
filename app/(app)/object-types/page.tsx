import { redirect } from 'next/navigation';
import { LayoutTemplate } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { getCurrentUser, isPassportAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Placeholder for the form builder — admin defines object types (Паспорт
// КИС, Паспорт БД, ЦОД, ...) and their fields here. This step (navigation
// shell, docs/it-passports-design.md plan step 2) only wires up access
// control; the actual builder UI is plan step 3.
export default async function ObjectTypesPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !isPassportAdmin(currentUser.passportRole)) {
    redirect('/');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Конструктор форм"
        description="Создавайте типы ИТ-объектов и их поля — Паспорт КИС, Паспорт БД, ЦОД, ДГУ и любые другие."
      />
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<LayoutTemplate className="h-6 w-6" />}
            title="Конструктор появится здесь"
            description="Создание типов объектов и полей — следующий шаг в плане модуля Паспортов."
          />
        </CardContent>
      </Card>
    </div>
  );
}
