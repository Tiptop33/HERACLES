import { NextResponse } from 'next/server';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Retirer un poste à pourvoir : il sort de l'affiche, sa ligne reste.
 *
 * Pourvu, ou remonté par erreur — dans les deux cas il n'a plus à circuler.
 * `retirer_un_poste()` (0057) ne touche que les postes de ma loge, et rend
 * faux pour tout le reste : un poste d'ailleurs et un poste déjà retiré se
 * répondent pareil, on ne dit pas ce qui existe ailleurs.
 *
 * Pas de fenêtre de confirmation : le geste ne perd rien. La ligne demeure en
 * base, et c'est la différence avec l'effacement d'une réunion, qui, lui, en
 * ouvre une.
 */

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[postes/retirer] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, poste: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne((corps as { retour?: string } | null)?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? '/espace/reunion', origine(requete));
      if (code) vers.searchParams.set('erreur_poste', code);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!/^[0-9a-f-]{36}$/i.test(poste)) {
    return repondre('introuvable', 'Ce poste n’existe pas.', 404);
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('retirer_un_poste', { poste_choisi: poste });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    console.error('[postes/retirer] retrait refusé', error);
    return repondre('echec', 'Le poste n’a pas pu être retiré.');
  }

  if (data === false) {
    return repondre('introuvable', 'Ce poste n’existe pas, ou il est déjà retiré.', 404);
  }

  return repondre(null, null);
}
