import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieAPoser = { name: string; value: string; options: CookieOptions };

/**
 * Client Supabase des composants et routes serveur. Il est lié aux cookies de
 * session : les requêtes partent au nom de l'utilisateur connecté, donc **la
 * RLS s'applique**. C'est le cas nominal — on s'appuie sur elle pour protéger
 * les données, jamais sur un filtre écrit à la main.
 */
export async function supabaseServer(reglages?: { sessionNavigateur?: boolean }) {
  const magasin = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return magasin.getAll();
        },
        setAll(aPoser: CookieAPoser[]) {
          try {
            aPoser.forEach(({ name, value, options }) => {
              // « Rester connecté » décoché : le cookie perd sa date
              // d'expiration et meurt avec le navigateur. C'est ce que la case
              // promet — sur un poste partagé, la session ne survit pas à la
              // fermeture de la fenêtre.
              const reglee = reglages?.sessionNavigateur
                ? { ...options, maxAge: undefined, expires: undefined }
                : options;
              magasin.set(name, value, reglee);
            });
          } catch {
            // Appelé depuis un composant serveur : les cookies sont en lecture
            // seule. Le middleware rafraîchit déjà la session, rien à faire ici.
          }
        },
      },
    },
  );
}
