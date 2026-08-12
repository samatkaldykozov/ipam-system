import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { IpAddressesClient } from '@/app/(app)/ip-addresses/ip-addresses-client';
import { IpAssignButton } from '@/app/(app)/ip-addresses/ip-assign-button';
import { getNetworkOptions } from '@/app/(app)/ip-addresses/actions';

export const dynamic = 'force-dynamic';

export default async function IpAddressesPage() {
  const networks = await getNetworkOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="IP Addresses"
        description="Track individual IP assignments across all networks."
      >
        <Button variant="outline">Filter</Button>
        <IpAssignButton networks={networks} />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>IP Address Pool</CardTitle>
        </CardHeader>
        <CardContent>
          <IpAddressesClient networks={networks} />
        </CardContent>
      </Card>
    </div>
  );
}
