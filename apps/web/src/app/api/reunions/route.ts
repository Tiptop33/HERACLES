import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, origine, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Ouvrir la réunion d'un jour, et tomber sur celle qui existe déjà.
 *
 * `ouvrir_une_reunion()` (migration 0036) rend la réunion du jour si elle est
 * déjà ouverte plutôt que d'en créer une seconde : deux personnes qui ouvrent
 * la même soirée doivent tenir la même feuille.
 */

const Formulaire = z.object({
  tenue_le: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Cette date ne se lit pas.')
    .optional()
    .or(z.literal('')),
  lieu: z.string().trim().max(200, 'Ce lieu est trop long.').optional(),
});

export async function POST(requete: Request) {
  try {
    return await traiter(requete);
  } catch (souci) {
    console.error('[reunions] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request) {
  const natif = vientDUnFormulaire(requete);
  const corps = await lireCorps(requete);

  const repondre = (code: string | null, message: string | null, reunion?: string) => {
    if (natif) {
      const vers = new URL('/espace/reunion', origine(requete));
      if (code) vers.searchParams.set('erreur', code);
      else if (reunion) vers.searchParams.set('appel', reunion);
      return NextResponse.redirect(vers, 303);
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: 400 })
      : NextResponse.json({ ok: true, reunion });
  };

  const lu = Formulaire.safeParse(corps);
  if (!lu.success) return repondre('date', lu.error.issues[0]?.message ?? 'Date invalide.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.');

  const { data, error } = await supabase.rpc('ouvrir_une_reunion', {
    jour: lu.data.tenue_le || new Date().toISOString().slice(0, 10),
    ou: lu.data.lieu?.trim() || null,
  });

  if (error) {
    // 42501 : pas de fiche de référent, ou pas de loge. Sans loge, pas de
    // registre — il n'y aurait personne à appeler.
    if (error.code === '42501') {
      return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.');
    }
    console.error('[reunions] ouverture refusée', error);
    return repondre('echec', 'La réunion n’a pas pu être ouverte.');
  }

  return repondre(null, null, data as string);
}
