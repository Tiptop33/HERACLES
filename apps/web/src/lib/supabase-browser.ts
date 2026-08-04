import { createBrowserClient } from '@supabase/ssr';

/**
 * Client Supabase du navigateur. Ne porte que la clé anon (publique) : toute
 * lecture ou écriture reste soumise à la RLS de Postgres.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
