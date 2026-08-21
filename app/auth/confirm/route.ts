import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Handles the link a user clicks from an invite (or password-reset) email.
// The Supabase email templates must point here with `token_hash` and
// `type` query params — see the README for the exact template to paste in
// under Authentication -> Email Templates in the Supabase dashboard.
//
// Route Handlers must return a Response directly (unlike Server Components,
// where `redirect()` from next/navigation can throw to short-circuit
// rendering) — so this builds NextResponse.redirect() explicitly.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
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
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=invite-link-invalid', origin),
  );
}
