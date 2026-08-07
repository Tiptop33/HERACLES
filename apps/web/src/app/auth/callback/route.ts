import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { accueilDuRole } from '@/lib/roles';
import { destinationInterne, origine } from '@/lib/formulaire';

/**
 * Retour d'un lien reçu par email — confirmation, invitation, réinitialisation.
 * Supabase renvoie un code à usage unique : on l'échange contre une session,
 * puis on dépose la personne là où le lien voulait la conduire.
 *
 * `suite` dit où. Sans elle, on retombe sur l'accueil du rôle. Elle est
 * vérifiée comme partout ailleurs : une adresse interne, jamais une absolue —
 * sans quoi un lien fabriqué emmènerait ailleurs une personne fraîchement
 * identifiée, session ouverte.
 */
export async function GET(requete: Request) {
  const url = new URL(requete.url);
  const racine = origine(requete);
  const code = url.searchParams.get('code');
  const suite = destinationInterne(url.searchParams.get('suite'));

  if (!code) {
    return NextResponse.redirect(new URL('/connexion?erreur=lien', racine));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/connexion?erreur=lien', racine));
  }

  if (suite) {
    return NextResponse.redirect(new URL(suite, racine));
  }

  const { data: profil } = await supabase.from('profil').select('role').single();

  return NextResponse.redirect(new URL(accueilDuRole(profil?.role), racine));
}
