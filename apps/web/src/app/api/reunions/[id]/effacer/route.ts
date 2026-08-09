import { NextResponse } from 'next/server';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Effacer une réunion, pour de bon.
 *
 * À ne pas confondre avec `/retirer`, qui se défait. Ici la réunion et ses
 * pointages quittent la base, et rien ne les ramène.
 *
 * `effacer_une_reunion()` (migration 0041) porte les trois barrières : le
 * titre qui donne le droit, la loge qui donne la cible, et le refus des
 * réunions reprises de Bubble — que la prochaine reprise recréerait.
 */

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[reunion/effacer] échec inattendu', souci);
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

  const { data, error } = await supabase.rpc('effacer_une_reunion', {
    reunion_choisie: reunion,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('droit', 'Ce compte ne peut pas effacer de réunion.', 403);
    }
    console.error('[reunion/effacer] effacement refusé', error);
    return repondre('echec', 'La réunion n’a pas pu être effacée.');
  }

  // La fonction rend un mot plutôt qu'un booléen : trois refus différents
  // méritent trois phrases différentes.
  if (data === 'bubble') {
    return repondre(
      'bubble',
      'Cette réunion vient de Bubble : la prochaine reprise la recréerait.',
      409,
    );
  }
  if (data !== 'effacee') {
    return repondre('introuvable', 'Cette réunion n’est pas de votre loge.', 404);
  }

  return repondre(null, null);
}
