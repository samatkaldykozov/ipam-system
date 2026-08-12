'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { prefixSchema, type PrefixValues } from '@/lib/validations';
import { getPrefixLength, requiresAncestor24 } from '@/lib/prefix-utils';
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
  createPrefix,
  updatePrefix,
  getAvailableParentPrefixes,
} from '@/app/(app)/prefixes/actions';
import {
  PREFIX_STATUSES,
  type NetworkOption,
  type ParentPrefixOption,
  type PrefixWithRelations,
} from '@/app/(app)/prefixes/types';

interface PrefixFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networks: NetworkOption[];
  prefix?: PrefixWithRelations | null;
}

const EMPTY: PrefixValues = {
  cidr: '',
  name: '',
  description: '',
  networkId: '',
  parentPrefixId: undefined,
  status: 'ACTIVE',
};

export function PrefixFormDialog({
  open,
  onOpenChange,
  networks,
  prefix,
}: PrefixFormDialogProps) {
  const isEdit = !!prefix;
  const [submitting, setSubmitting] = React.useState(false);
  const [parentOptions, setParentOptions] = React.useState<ParentPrefixOption[]>([]);
  const [loadingParents, setLoadingParents] = React.useState(false);

  const form = useForm<PrefixValues>({
    resolver: zodResolver(prefixSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (open) {
      if (prefix) {
        form.reset({
          cidr: prefix.cidr,
          name: prefix.name ?? '',
          description: prefix.description ?? '',
          networkId: prefix.networkId,
          parentPrefixId: prefix.parentPrefixId ?? undefined,
          status: prefix.status,
        });
      } else {
        form.reset(EMPTY);
      }
    }
  }, [open, prefix, form]);

  const selectedNetworkId = form.watch('networkId');
  const cidrValue = form.watch('cidr');

  React.useEffect(() => {
    if (!open) return;
    if (!selectedNetworkId) {
      setParentOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingParents(true);
    getAvailableParentPrefixes(selectedNetworkId, prefix?.id)
      .then((options) => {
        if (!cancelled) setParentOptions(options);
      })
      .finally(() => {
        if (!cancelled) setLoadingParents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNetworkId, open, prefix?.id]);

  const filteredParentOptions = React.useMemo(() => {
    const childLen = getPrefixLength(cidrValue);
    if (childLen === null || !requiresAncestor24(cidrValue)) return parentOptions;
    return parentOptions.filter((p) => {
      const pLen = getPrefixLength(p.cidr);
      return pLen !== null && pLen >= 24 && pLen < childLen;
    });
  }, [parentOptions, cidrValue]);

  async function onSubmit(values: PrefixValues) {
    setSubmitting(true);
    const result = isEdit
      ? await updatePrefix(prefix!.id, values)
      : await createPrefix(values);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof PrefixValues, { message });
        }
      }
      if (result.message && !result.fieldErrors) {
        toast.error(result.message);
      }
      return;
    }

    toast.success(result.message ?? (isEdit ? 'Prefix updated' : 'Prefix created'));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Prefix' : 'New Prefix'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the prefix details below.'
              : 'Create a new subnet prefix in your inventory.'}
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
              name="cidr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CIDR</FormLabel>
                  <FormControl>
                    <Input placeholder="10.0.0.0/24" {...field} />
                  </FormControl>
                  <FormDescription>
                    The subnet range in CIDR notation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parentPrefixId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Prefix</FormLabel>
                  <Select
                    value={field.value ?? 'none'}
                    onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                    disabled={!selectedNetworkId || loadingParents}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="No parent (top-level)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No parent (top-level)</SelectItem>
                      {filteredParentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.cidr}
                          {p.name ? ` — ${p.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Optional. Prefixes /25 or more specific require a parent of /24 or more specific.
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
                    <Input placeholder="DMZ Subnet" {...field} />
                  </FormControl>
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
                      {PREFIX_STATUSES.map((s) => (
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
                      placeholder="Optional notes about this prefix"
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
                  'Create prefix'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
