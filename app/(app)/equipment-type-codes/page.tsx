import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, isPassportAdmin } from '@/lib/auth';
import { getEquipmentTypeCodes } from '@/app/(app)/equipment-type-codes/actions';
import { EquipmentTypeCodesTable } from '@/app/(app)/equipment-type-codes/equipment-type-codes-table';

export const dynamic = 'force-dynamic';

// Admin dictionary of equipment-type codes (CMDB phase 3, see
// it-passports-design.md section 8) — used by AUTO_IDENTIFIER fields in
// the form builder to assemble composite identifiers like "alma-A1-cs-3".
// Seeded with a handful of codes from Table 2 of the Kazakhtelecom naming
// standard; the admin adds the rest here as new equipment types are onboarded.
export default async function EquipmentTypeCodesPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !isPassportAdmin(currentUser.passportRole)) {
    redirect('/');
  }

  const codes = await getEquipmentTypeCodes();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Коды оборудования"
        description="Справочник кодов типов оборудования (например «cs» — коммутатор) для составных идентификаторов КЕ. Полный список — в инструкции по идентификации объектов ДИТ/И-05-28.2-16, таблица 2."
      />
      <Card>
        <CardHeader>
          <CardTitle>Коды</CardTitle>
        </CardHeader>
        <CardContent>
          <EquipmentTypeCodesTable codes={codes} />
        </CardContent>
      </Card>
    </div>
  );
}
