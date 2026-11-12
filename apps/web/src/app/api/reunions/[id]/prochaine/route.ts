import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destinationInterne, lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * La date de la prochaine réunion, dite sur la feuille d'appel (migration
 * 0085) et imprimée sur le compte rendu.
 *
 * Toute la loge peut la dire, comme l'appel et l'affichette ;
 * `choisir_la_prochaine_reunion()` n'accepte qu'une réunion de ma loge, non
 * retirée, et une date qui vient après elle. Vide : la date se recalcule.
 */

const UUID = /^[0-9a-f-]{36}$/i;

/** « AAAA-MM-JJ » d'un jour qui existe, ou vide. */
const DateSaisie = z.union([
  z.literal(''),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Cette date ne se lit pas.')
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, 'Cette date ne se lit pas.'),
]);

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await choisir(requete, (await params).id);
  } catch (souci) {
    console.error('[reunion/prochaine] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function choisir(requete: Request, reunion: string) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);
  const demande = destinationInterne(corps?.retour);

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      const vers = new URL(demande ?? `/espace/reunion?appel=${reunion}`, origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      return NextResponse.redirect(vers, 303);
    }
    return code ? NextResponse.json({ erreur: message }, { status: statut }) : NextResponse.json({ ok: true });
  };

  if (!UUID.test(reunion)) return repondre('introuvable', 'Cette réunion n’existe pas.', 404);

  const lu = DateSaisie.safeParse(typeof corps?.prochaine === 'string' ? corps.prochaine.trim() : '');
  if (!lu.success) return repondre('date', 'Cette date ne se lit pas.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('choisir_la_prochaine_reunion', {
    reunion_choisie: reunion,
    date_choisie: lu.data === '' ? null : lu.data,
  });

  if (error) {
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    }
    console.error('[reunion/prochaine] date refusée', error);
    return repondre('echec', 'La date n’a pas pu être enregistrée.');
  }
  if (data === 'reunion') return repondre('introuvable', 'Cette réunion n’est pas de votre loge.', 404);
  if (data === 'date') return repondre('prochaine', 'La prochaine réunion doit tomber après celle-ci.');
  return repondre(null, null);
}
