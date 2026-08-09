import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { ABSENT, EXCUSE, PRESENT } from '@/lib/reunion';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Cocher un référent : présent, excusé, absent.
 *
 * Un envoi par clic, et c'est voulu : l'appel se fait à voix haute, nom par
 * nom, et chaque réponse doit être enregistrée au moment où elle est donnée.
 * Une feuille qu'on remplit puis qu'on soumet perd tout si le téléphone se
 * verrouille au milieu.
 *
 * `pointer_a_l_appel()` (migration 0036) refuse d'elle-même une réunion qui
 * n'est pas de sa loge, et un référent qui n'y siège pas.
 */

const Formulaire = z.object({
  referent: z.string().regex(/^[0-9a-f-]{36}$/i, 'Ce référent ne se lit pas.'),
  etat: z.enum([PRESENT, EXCUSE, ABSENT], { message: 'Cet état n’existe pas.' }),
  retour: z.string().optional(),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, (await params).id);
  } catch (souci) {
    console.error('[appel] échec inattendu', souci);
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

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) return repondre('etat', lu.error.issues[0]?.message ?? 'Appel invalide.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('pointer_a_l_appel', {
    reunion_choisie: reunion,
    le_referent: lu.data.referent,
    nouvel_etat: lu.data.etat,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    if (error.code === '23514') {
      return repondre('etat', 'Cet état n’existe pas.');
    }
    console.error('[appel] pointage refusé', error);
    return repondre('echec', 'L’appel n’a pas pu être enregistré.');
  }

  if (data === false) {
    return repondre(
      'introuvable',
      'Cette réunion n’est pas de votre loge, ou ce référent n’y siège pas.',
      404,
    );
  }

  return repondre(null, null);
}
