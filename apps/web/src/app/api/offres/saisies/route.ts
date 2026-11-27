import { NextResponse } from 'next/server';
import { FicheDOffre, premiereErreurDeLaFiche } from '@/lib/offres-saisies';
import { refusDeLaBase } from '@/lib/offres-saisies-serveur';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Saisir une offre à la main, depuis la fenêtre « Nouvelle offre » de l'écran
 * « Offres internes » (0114, 0115). La session d'abord ; le droit est dans la base :
 * les référents et l'administration (`saisir_une_offre`), qui contrôle de
 * nouveau chaque champ. Rend l'identifiant de l'offre créée.
 */
export async function POST(requete: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const lu = FicheDOffre.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json({ erreur: premiereErreurDeLaFiche(lu.error) }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('saisir_une_offre', { les_champs: lu.data });
    if (error) return refusDeLaBase(error, 'L’offre n’a pas pu être enregistrée. Réessayez.');
    return NextResponse.json({ id: data as string }, { status: 201 });
  } catch (souci) {
    console.error('[offres saisies] saisie : échec inattendu', souci);
    return NextResponse.json({ erreur: 'L’offre n’a pas pu être enregistrée. Réessayez.' }, { status: 503 });
  }
}
