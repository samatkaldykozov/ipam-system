'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AssignIpDialog } from '@/app/(app)/ip-addresses/assign-ip-dialog';

type NetworkOption = { id: string; name: string; cidr: string };

interface IpAssignButtonProps {
  networks: NetworkOption[];
}

export function IpAssignButton({ networks }: IpAssignButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Assign IP
      </Button>
      <AssignIpDialog
        open={open}
        onOpenChange={setOpen}
        networks={networks}
      />
    </>
  );
}
