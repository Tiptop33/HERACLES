import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase sous clé `service_role`. **Il contourne la RLS.**
 *
 * L'ordre n'est jamais négociable : d'abord vérifier la session, ensuite le
 * droit métier, et alors seulement appeler ceci. Une route qui commence par
 * `supabaseAdmin()` a déjà tort.
 *
 * La clé ne doit jamais atteindre le navigateur : ce module n'est importé que
 * par des routes serveur, et la variable n'est pas préfixée `NEXT_PUBLIC_`.
 */
export function supabaseAdmin() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cle) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY est absente : la route qui en a besoin ne peut pas fonctionner.',
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
