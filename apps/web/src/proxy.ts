import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Chemins réservés aux personnes connectées. */
const CHEMINS_PROTEGES = ['/espace', '/mon-compte'];

type CookieAPoser = { name: string; value: string; options: CookieOptions };

/**
 * Rafraîchit la session à chaque requête (sans quoi le jeton expire et
 * l'utilisateur se retrouve déconnecté sans raison), puis referme la porte des
 * espaces privés. Le contrôle qui compte reste la RLS côté base : ce garde-fou
 * n'évite que d'afficher une page vide à qui n'est pas connecté.
 *
 * Fichier `proxy.ts` et non `middleware.ts` : depuis Next.js 16.2, la
 * convention « middleware » est dépréciée au profit de « proxy ».
 */
export async function proxy(requete: NextRequest) {
  let reponse = NextResponse.next({ request: requete });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return requete.cookies.getAll();
        },
        setAll(aPoser: CookieAPoser[]) {
          aPoser.forEach(({ name, value }) => requete.cookies.set(name, value));
          reponse = NextResponse.next({ request: requete });
          aPoser.forEach(({ name, value, options }) => reponse.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const chemin = requete.nextUrl.pathname;
  const protege = CHEMINS_PROTEGES.some((p) => chemin === p || chemin.startsWith(`${p}/`));

  if (!user && protege) {
    const versConnexion = requete.nextUrl.clone();
    versConnexion.pathname = '/connexion';
    versConnexion.search = `?suite=${encodeURIComponent(chemin)}`;

    const redirection = NextResponse.redirect(versConnexion);
    // Reporter les cookies rafraîchis, sinon la session se perd en route.
    reponse.cookies.getAll().forEach((c) => redirection.cookies.set(c));
    return redirection;
  }

  return reponse;
}

export const config = {
  matcher: [
    // Tout, sauf les ressources statiques et les images.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
