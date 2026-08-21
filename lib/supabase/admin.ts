import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Server-only client authenticated with the service role key. This bypasses
// Row Level Security and can call Auth Admin endpoints (like inviting a
// user by email) that the anon key cannot. NEVER import this from a client
// component or any code that ships to the browser — only from 'use server'
// actions and other server-only modules.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase admin client is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
