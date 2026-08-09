import { NextResponse } from 'next/server';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Fermer la feuille d'appel.
 *
 * Ce n'est pas qu'un lien de retour : la fermeture pose « Absent » sur les
 * référents que personne n'a nommés. Dans une feuille d'appel, celui qu'on
 * n'a pas appelé n'était pas là — laisser la case vide reviendrait à perdre
 * l'information au moment même où elle est complète.
 *
 * `clore_la_feuille()` (migration 0039) n'écrase aucun état déjà posé et se
 * rejoue sans rien changer : refermer deux fois n'a aucun effet.
 */

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[reunion/clore] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, reunion: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/reunion', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!/^[0-9a-f-]{36}$/i.test(reunion)) {
    return repondre('introuvable', 'Cette réunion n’existe pas.', 404);
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('clore_la_feuille', {
    reunion_choisie: reunion,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    console.error('[reunion/clore] fermeture refusée', error);
    return repondre('echec', 'La feuille n’a pas pu être fermée.');
  }

  if (data === null) {
    return repondre('introuvable', 'Cette réunion n’est pas de votre loge.', 404);
  }

  return repondre(null, null);
}
