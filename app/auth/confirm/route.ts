import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

// Handles the link a user clicks from an invite (or password-reset) email.
// The Supabase email templates must point here with `token_hash` and
// `type` query params — see the README for the exact template to paste in
// under Authentication -> Email Templates in the Supabase dashboard.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      redirect(next);
    }
  }

  redirect('/login?error=invite-link-invalid');
}
