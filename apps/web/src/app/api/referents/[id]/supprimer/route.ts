import { NextResponse } from 'next/server';
import { z } from 'zod';
import { origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Retirer la fiche d'un référent. **Réservé aux administrateurs.**
 *
 * Une route à part, et non un verbe `DELETE` sur la précédente : un
 * formulaire HTML ne sait envoyer qu'un `POST`, et cet écran doit marcher
 * avant que la moindre ligne de script ne soit chargée.
 *
 * Rien n'est vérifié ici. `supprimer_referent` (migration 0016) refuse à qui
 * n'est pas administrateur, sur sa propre fiche, et sur une fiche qui
 * accompagne des candidats. La table n'a toujours aucune policy de
 * suppression : cette fonction est la seule porte, et elle est gardée.
 */

/** Ce que la base répond, traduit pour la personne qui a cliqué. */
const REFUS: Record<string, { code: string; message: string; statut: number }> = {
  '42501': {
    code: 'droit',
    message: 'Seul un administrateur peut retirer une fiche.',
    statut: 403,
  },
  P0002: {
    code: 'absente',
    message: "Cette fiche n'existe plus.",
    statut: 404,
  },
  '23001': {
    code: 'candidats',
    message: 'Cette fiche accompagne encore des candidats. Confiez-les à quelqu’un d’abord.',
    statut: 409,
  },
  '23514': {
    code: 'soi',
    message: 'On ne retire pas sa propre fiche.',
    statut: 409,
  },
};

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, params);
  } catch (souci) {
    console.error('[referents] suppression : échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, params: Promise<{ id: string }>) {
  const { id } = await params;
  const natif = vientDUnFormulaire(requete);

  // Le formulaire natif revient à l'annuaire ; le message s'affiche là-bas.
  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL('/espace/referents', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) return repondre('absente', "Cette fiche n'existe plus.", 404);

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { error } = await supabase.rpc('supprimer_referent', { cible: id });

  if (error) {
    const refus = REFUS[error.code ?? ''];
    if (refus) return repondre(refus.code, refus.message, refus.statut);

    console.error('[referents] suppression refusée', error);
    return repondre('echec', "La fiche n'a pas pu être retirée.", 400);
  }

  return repondre(null, null);
}
