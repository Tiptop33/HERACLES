import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { accueilDuRole } from '@/lib/roles';

/**
 * Retour du lien de confirmation reçu par email. Supabase renvoie un code
 * à usage unique : on l'échange contre une session, puis on dépose la personne
 * dans l'espace qui correspond à son rôle.
 */
export async function GET(requete: Request) {
  const url = new URL(requete.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/connexion?erreur=lien', url.origin));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/connexion?erreur=lien', url.origin));
  }

  const { data: profil } = await supabase.from('profil').select('role').single();

  return NextResponse.redirect(new URL(accueilDuRole(profil?.role), url.origin));
}
