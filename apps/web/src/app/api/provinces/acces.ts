import { NextResponse } from 'next/server';
import { lireProvincesAGerer, type ProvinceAGerer } from '@/lib/provinces';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * La porte commune des routes de l'écran Province, côté administration
 * (migration 0096).
 *
 * La session d'abord, puis le droit : l'administration seulement. Les
 * fonctions de la base refusent d'elles-mêmes une autre session — ce
 * contrôle-ci répond clairement, sans rien demander à la base pour rien.
 */

type Client = Awaited<ReturnType<typeof supabaseServer>>;

const REFUS = 'Les provinces se gèrent par l’administration.';

export async function ouvrir(): Promise<{ ok: true; supabase: Client } | { ok: false; reponse: NextResponse }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reponse: NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 }) };
  }
  const { data: admin } = await supabase.rpc('est_admin');
  if (admin !== true) {
    return { ok: false, reponse: NextResponse.json({ erreur: REFUS }, { status: 403 }) };
  }
  return { ok: true, supabase };
}

/** La liste à jour, que chaque route rend pour que l'écran l'affiche telle quelle. */
export async function lister(supabase: Client): Promise<ProvinceAGerer[] | null> {
  const { data, error } = await supabase.rpc('provinces_a_gerer');
  if (error) return null;
  return lireProvincesAGerer(data);
}

/** Une réponse qui porte la liste à jour, ou « indisponible » si elle n'a pas pu être relue. */
export async function repondre(supabase: Client, autres: Record<string, unknown> = {}) {
  const provinces = await lister(supabase);
  return provinces ? NextResponse.json({ ...autres, provinces }) : indisponible();
}

/** Traduire un refus de la base en message pour l'écran. */
export function refus(etiquette: string, error: { code?: string }) {
  switch (error.code) {
    case '42501':
      return NextResponse.json({ erreur: REFUS }, { status: 403 });
    case '23505':
      return NextResponse.json({ erreur: 'Une autre province porte déjà ce nom.' }, { status: 409 });
    case '23514':
      return NextResponse.json(
        { erreur: 'Ce nom n’est pas accepté : il est vide, ou dépasse 120 caractères.' },
        { status: 400 },
      );
    case 'P0002':
      return NextResponse.json({ erreur: 'Cette province n’existe plus.' }, { status: 404 });
    default:
      console.error(`[provinces] ${etiquette}`, error.code);
      return indisponible();
  }
}

export function indisponible() {
  return NextResponse.json(
    { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
    { status: 503 },
  );
}

/** Le premier message d'une saisie refusée par zod. */
export function saisieRefusee(message: string | undefined) {
  return NextResponse.json({ erreur: message ?? 'Saisie invalide.' }, { status: 400 });
}
