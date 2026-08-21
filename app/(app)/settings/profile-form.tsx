'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { profileSchema, type ProfileValues } from '@/lib/validations';
import { updateProfile } from '@/app/(app)/settings/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProfileFormProps {
  email: string;
  fullName: string | null;
}

export function ProfileForm({ email, fullName }: ProfileFormProps) {
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: fullName ?? '' },
  });

  async function onSubmit(values: ProfileValues) {
    setSubmitting(true);
    const result = await updateProfile(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.message ?? 'Failed to update profile');
      return;
    }

    toast.success(result.message ?? 'Profile updated');
    reset({ fullName: values.fullName });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your account information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              placeholder="Your name"
              {...register('fullName')}
            />
            {errors.fullName ? (
              <p className="text-xs text-destructive">
                {errors.fullName.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} disabled readOnly />
            <p className="text-xs text-muted-foreground">
              Your email is tied to your sign-in and can&apos;t be changed here.
              Ask an admin if it needs to change.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting || !isDirty}
            onClick={() => reset({ fullName: fullName ?? '' })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !isDirty}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
