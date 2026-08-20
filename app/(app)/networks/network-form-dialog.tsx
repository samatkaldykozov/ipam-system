'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { networkSchema, type NetworkValues } from '@/lib/validations';
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
  createNetwork,
  updateNetwork,
  getAvailableParents,
} from '@/app/(app)/networks/actions';
import {
  NETWORK_STATUSES,
  type LocationOption,
  type NetworkWithRelations,
  type ParentOption,
} from '@/app/(app)/networks/types';

interface NetworkFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationOption[];
  network?: NetworkWithRelations | null;
}

const EMPTY: NetworkValues = {
  name: '',
  cidr: '',
  description: '',
  vlanId: undefined as unknown as number | undefined,
  locationId: undefined,
  parentId: undefined,
  status: 'ACTIVE',
};

export function NetworkFormDialog({
  open,
  onOpenChange,
  locations,
  network,
}: NetworkFormDialogProps) {
  const isEdit = !!network;
  const [submitting, setSubmitting] = React.useState(false);
  const [parentOptions, setParentOptions] = React.useState<ParentOption[]>([]);

  const form = useForm<NetworkValues>({
    resolver: zodResolver(networkSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (open) {
      if (network) {
        form.reset({
          name: network.name,
          cidr: network.cidr,
          description: network.description ?? '',
          vlanId:
            network.vlanId ?? (undefined as unknown as number | undefined),
          locationId: network.locationId ?? undefined,
          parentId: network.parentId ?? undefined,
          status: network.status,
        });
      } else {
        form.reset(EMPTY);
      }
      getAvailableParents(network?.id).then(setParentOptions);
    }
  }, [open, network, form]);

  async function onSubmit(values: NetworkValues) {
    setSubmitting(true);
    const result = isEdit
      ? await updateNetwork(network!.id, values)
      : await createNetwork(values);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof NetworkValues, { message });
        }
      }
      if (result.message && !result.fieldErrors) {
        toast.error(result.message);
      }
      return;
    }

    toast.success(
      result.message ?? (isEdit ? 'Network updated' : 'Network created'),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Network' : 'New Network'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the network details below.'
              : 'Create a new network block in your inventory.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="cidr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CIDR</FormLabel>
                  <FormControl>
                    <Input placeholder="10.0.0.0/24" {...field} />
                  </FormControl>
                  <FormDescription>
                    The network range in CIDR notation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Network</FormLabel>
                  <Select
                    value={field.value ?? 'none'}
                    onValueChange={(v) =>
                      field.onChange(v === 'none' ? undefined : v)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="No parent (top-level)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">
                        No parent (top-level)
                      </SelectItem>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.cidr}
                          {p.name ? ` — ${p.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Optional. Leave empty for a top-level allocation, or pick an
                    existing network to nest this one inside it as a subnet.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Corporate LAN" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="vlanId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VLAN</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={4094}
                        placeholder="100"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription>1–4094, optional.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        {NETWORK_STATUSES.map((s) => (
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
            </div>

            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <Select
                    value={field.value ?? 'none'}
                    onValueChange={(v) =>
                      field.onChange(v === 'none' ? undefined : v)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="No location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No location</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name} ({loc.code})
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
                      placeholder="Optional notes about this network"
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
                    Saving…
                  </>
                ) : isEdit ? (
                  'Save changes'
                ) : (
                  'Create network'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
