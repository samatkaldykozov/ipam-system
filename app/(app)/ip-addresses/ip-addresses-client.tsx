'use client';

import * as React from 'react';
import { Plus, Server } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { AssignIpDialog } from '@/app/(app)/ip-addresses/assign-ip-dialog';

type NetworkOption = { id: string; name: string; cidr: string };

interface IpAddressesClientProps {
  networks: NetworkOption[];
}

export function IpAddressesClient({ networks }: IpAddressesClientProps) {
  const [assignOpen, setAssignOpen] = React.useState(false);

  return (
    <>
      <EmptyState
        icon={<Server className="h-6 w-6" />}
        title="No IP addresses yet"
        description="Assign an IP address to a host or reserve it for future use."
        action={
          <Button onClick={() => setAssignOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Assign IP
          </Button>
        }
      />

      <AssignIpDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        networks={networks}
      />
    </>
  );
}
