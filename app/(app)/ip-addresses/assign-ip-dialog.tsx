'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ipAddressSchema, type IpAddressValues } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createIpAddress,
  updateIpAddress,
} from '@/app/(app)/ip-addresses/actions';
import {
  IP_STATUSES,
  type IpAddressWithNetwork,
  type NetworkOption,
} from '@/app/(app)/ip-addresses/types';

interface AssignIpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networks: NetworkOption[];
  ipAddress?: IpAddressWithNetwork | null;
}

const EMPTY: IpAddressValues = {
  address: '',
  hostname: '',
  macAddress: '',
  networkId: '',
  status: 'ASSIGNED',
  description: '',
};

export function AssignIpDialog({
  open,
  onOpenChange,
  networks,
  ipAddress,
}: AssignIpDialogProps) {
  const isEdit = !!ipAddress;
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<IpAddressValues>({
    resolver: zodResolver(ipAddressSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (open) {
      if (ipAddress) {
        form.reset({
          address: ipAddress.address,
          hostname: ipAddress.hostname ?? '',
          macAddress: ipAddress.macAddress ?? '',
          networkId: ipAddress.networkId,
          status: ipAddress.status,
          description: ipAddress.description ?? '',
        });
      } else {
        form.reset(EMPTY);
      }
    }
  }, [open, ipAddress, form]);

  async function onSubmit(values: IpAddressValues) {
    setSubmitting(true);
    const result = isEdit
      ? await updateIpAddress(ipAddress!.id, values)
      : await createIpAddress(values);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof IpAddressValues, { message });
        }
      }
      if (result.message && !result.fieldErrors) {
        toast.error(result.message);
      }
      return;
    }

    toast.success(
      result.message ?? (isEdit ? 'IP address updated' : 'IP address assigned'),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit IP Address' : 'Assign IP'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details for this IP address.'
              : 'Assign an IP address to a network and optionally add host details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="networkId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Network</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a network" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {networks.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.name} ({n.cidr})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP Address</FormLabel>
                  <FormControl>
                    <Input placeholder="10.0.0.5" {...field} />
                  </FormControl>
                  <FormDescription>
                    The individual IP address to assign.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="hostname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostname</FormLabel>
                    <FormControl>
                      <Input placeholder="server-01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="macAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MAC Address</FormLabel>
                    <FormControl>
                      <Input placeholder="00:1A:2B:3C:4D:5E" {...field} />
                    </FormControl>
                    <FormDescription>Optional.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {IP_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0) + s.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes about this assignment"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEdit ? 'Saving…' : 'Assigning…'}
                  </>
                ) : isEdit ? (
                  'Save changes'
                ) : (
                  'Assign IP'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
