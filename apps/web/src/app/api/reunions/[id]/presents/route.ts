import { NextResponse } from 'next/server';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Cocher « Présent » d'un coup sur tous ceux qui sont en ligne.
 *
 * Le raccourci du geste un à un (`/appel`), et rien de plus : ce que ce bouton
 * pose, on aurait pu le poser à la main, ligne après ligne. Il ne fait gagner
 * que des clics — c'est aussi pourquoi il ne mérite pas de confirmation.
 *
 * `pointer_les_connectes()` (migration 0052) tient les trois règles :
 *
 *   · elle refuse une réunion qui n'est pas de sa loge ;
 *   · elle n'écrase aucun état déjà posé — un « Excusé » saisi à la main est
 *     une information, et ce bouton n'a pas à la défaire ;
 *   · elle marque exactement ceux que l'écran montre en pointillé, puisqu'elle
 *     lit la même liste que lui.
 */

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[presents] échec inattendu', souci);
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

  const { data, error } = await supabase.rpc('pointer_les_connectes', {
    reunion_choisie: reunion,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    console.error('[presents] pointage refusé', error);
    return repondre('echec', 'L’appel n’a pas pu être enregistré.');
  }

  // `null` : la réunion n'est pas de ma loge. Le même message que le pointage
  // un à un — on ne dit pas ce qui existe ailleurs.
  if (data === null) {
    return repondre('introuvable', 'Cette réunion n’est pas de votre loge.', 404);
  }

  return repondre(null, null);
}
