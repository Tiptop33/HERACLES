import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lireCorps, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Prendre en charge une nouvelle demande, ou la confier à un collègue.
 *
 * Tout se décide en base, dans `designer_le_referent()` (migration 0057) :
 * un référent de la loge du candidat, tant que personne ne l'accompagne — ou
 * son référent actuel, qui le passe à un collègue. On ne retire pas un
 * candidat à quelqu'un d'autre : cela se décide en commission.
 *
 * Un formulaire natif suffit : aucun script n'est nécessaire pour ce geste,
 * qui revient sur la fiche du candidat.
 */

const Formulaire = z.object({
  // Vide : soi-même.
  referent_id: z
    .string()
    .trim()
    .optional()
    .transform((valeur) => (valeur ? valeur : null))
    .refine((valeur) => valeur === null || z.uuid().safeParse(valeur).success, {
      message: 'Référent inconnu.',
    }),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const natif = vientDUnFormulaire(requete);
  const fiche = `/espace/candidats`;

  const repondre = (code: string | null, message: string | null, statut = 400) => {
    if (natif) {
      // `prise` et non `erreur` : sur le poste de travail, `erreur` est la
      // réponse de la route du journal, et l'onglet Suivi l'afficherait.
      return retourAvecCode(requete, fiche, { fiche: id, prise: code });
    }
    return code
      ? NextResponse.json({ erreur: message }, { status: statut })
      : NextResponse.json({ ok: true });
  };

  if (!z.uuid().safeParse(id).success) return repondre('introuvable', 'Fiche introuvable.', 404);

  const lu = Formulaire.safeParse(await lireCorps(requete));
  if (!lu.success) return repondre('referent', 'Référent inconnu.');

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return repondre('session', 'Session expirée.', 401);

  const { data, error } = await supabase.rpc('designer_le_referent', {
    le_candidat: id,
    le_referent: lu.data.referent_id,
  });

  if (error) {
    if (error.code === '42501') return repondre('sans-loge', 'Votre compte n’est rattaché à aucune loge.', 403);
    if (error.code === '23503') return repondre('referent', 'Ce référent n’est pas de votre loge.');
    console.error('[candidats/referent] désignation refusée', error.code);
    return repondre('echec', 'La prise en charge a échoué.');
  }

  // Faux : le candidat n'est pas désignable par cette personne — hors de sa
  // loge, ou déjà accompagné par un autre. Même réponse que pour un
  // identifiant inventé.
  if (data !== true) return repondre('introuvable', 'Fiche introuvable.', 404);

  return repondre(null, null);
}
