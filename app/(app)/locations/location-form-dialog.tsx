'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { locationSchema, type LocationValues } from '@/lib/validations';
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
  createLocation,
  updateLocation,
  getAvailableLocationParents,
} from '@/app/(app)/locations/actions';
import {
  LOCATION_KIND_OPTIONS,
  locationKindLabel,
  type LocationParentOption,
  type LocationWithCount,
} from '@/app/(app)/locations/types';

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: LocationWithCount | null;
}

const EMPTY: LocationValues = {
  kind: 'BUILDING',
  parentId: undefined,
  name: '',
  code: '',
  rowCode: '',
  rackUnits: undefined,
  address: '',
  city: '',
  country: '',
  latitude: undefined,
  longitude: undefined,
  description: '',
};

export function LocationFormDialog({
  open,
  onOpenChange,
  location,
}: LocationFormDialogProps) {
  const isEdit = !!location;
  const [submitting, setSubmitting] = React.useState(false);
  const [parentOptions, setParentOptions] = React.useState<
    LocationParentOption[]
  >([]);

  const form = useForm<LocationValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: EMPTY,
  });

  React.useEffect(() => {
    if (open) {
      if (location) {
        form.reset({
          kind: location.kind,
          parentId: location.parentId ?? undefined,
          name: location.name,
          code: location.code,
          rowCode: location.rowCode ?? '',
          rackUnits: location.rackUnits ?? undefined,
          address: location.address ?? '',
          city: location.city ?? '',
          country: location.country ?? '',
          latitude: location.latitude ?? undefined,
          longitude: location.longitude ?? undefined,
          description: location.description ?? '',
        });
      } else {
        form.reset(EMPTY);
      }
      getAvailableLocationParents(location?.id).then(setParentOptions);
    }
  }, [open, location, form]);

  const kind = form.watch('kind');

  async function onSubmit(values: LocationValues) {
    setSubmitting(true);
    const result = isEdit
      ? await updateLocation(location!.id, values)
      : await createLocation(values);
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof LocationValues, { message });
        }
      }
      if (result.message && !result.fieldErrors) {
        toast.error(result.message);
      }
      return;
    }

    toast.success(
      result.message ?? (isEdit ? 'Location updated' : 'Location created'),
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Location' : 'New Location'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the location details below.'
              : 'Add a node to the location hierarchy — a region, city, building, room, secure zone, or rack.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kind</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LOCATION_KIND_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
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
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent</FormLabel>
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
                            {p.name} ({locationKindLabel(p.kind)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Where this node sits in the hierarchy. Leave empty for a
                      top-level region or city.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Main Data Center" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="DC-01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {kind === 'RACK' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="rowCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Row</FormLabel>
                      <FormControl>
                        <Input placeholder="A" {...field} />
                      </FormControl>
                      <FormDescription>
                        Optional row letter/number, if racks in this zone are
                        arranged in rows. Leave empty if they aren&apos;t.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rackUnits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rack units (U)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          placeholder="42"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        Total capacity in U — used by the rack elevation view.
                        Leave empty if not known yet.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Almaty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Kazakhstan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="43.238949"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="76.889709"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional notes about this location"
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
                  'Create location'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
