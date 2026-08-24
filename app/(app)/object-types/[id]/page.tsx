import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser, isPassportAdmin } from '@/lib/auth';
import {
  getObjectType,
  getPassportRoles,
} from '@/app/(app)/object-types/actions';
import { FieldsBuilder } from '@/app/(app)/object-types/[id]/fields-builder';

export const dynamic = 'force-dynamic';

export default async function ObjectTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser || !isPassportAdmin(currentUser.passportRole)) {
    redirect('/');
  }

  const [objectType, passportRoles] = await Promise.all([
    getObjectType(id),
    getPassportRoles(),
  ]);

  if (!objectType) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={objectType.name}
        description={objectType.description || `Код: ${objectType.code}`}
      >
        <Badge variant="outline">
          {objectType._count.instances} паспорт(ов)
        </Badge>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Поля</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldsBuilder
            objectTypeId={objectType.id}
            fields={objectType.fields}
            passportRoles={passportRoles}
          />
        </CardContent>
      </Card>
    </div>
  );
}
