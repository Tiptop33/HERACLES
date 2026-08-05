import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Enregistrer une fiche candidat.
 *
 * Deux garde-fous se superposent, et c'est voulu :
 *   * ce formulaire ne connaît que les champs modifiables — le rattachement
 *     (référent, parrain, loge, numéro) n'y figure pas ;
 *   * et quand bien même il y figurerait, un déclencheur SQL (migration 0006)
 *     remet l'ancienne valeur. Un champ désactivé dans une page ne protège rien.
 *
 * La RLS, elle, décide de quelles fiches sont modifiables. `eq('id', …)` ne fait
 * que viser la bonne ligne : sans clause, la requête viserait toute la table.
 */

/** Chaîne facultative : vide ou blancs deviennent `null` en base. */
const texte = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((valeur) => (valeur === '' ? null : valeur))
    .nullable()
    .optional();

const courriel = texte(320).refine(
  (valeur) => valeur == null || z.email().safeParse(valeur).success,
  { message: 'Adresse email invalide.' },
);

const jour = texte(10).refine((valeur) => valeur == null || /^\d{4}-\d{2}-\d{2}$/.test(valeur), {
  message: 'Date invalide.',
});

const Formulaire = z.object({
  prenom: texte(120),
  nom: texte(120),
  telephone: texte(40),
  email: courriel,
  ville: texte(120),
  code_postal: texte(10),
  type_emploi: texte(60),
  emploi_recherche: texte(200),
  mobilite_geographique: texte(200),
  debut_stage: jour,
  experiences: texte(5000),
  appreciation: texte(500),
});

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ erreur: 'Fiche introuvable.' }, { status: 404 });
  }

  const brut = await requete.json().catch(() => null);
  const lu = Formulaire.safeParse(brut);

  if (!lu.success) {
    const premier = lu.error.issues[0]?.message;
    return NextResponse.json(
      { erreur: premier && premier !== 'Invalid input' ? premier : 'Formulaire invalide.' },
      { status: 400 },
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('candidat')
    .update(lu.data)
    .eq('id', id)
    .select('id, maj_le')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ erreur: "L'enregistrement a échoué." }, { status: 400 });
  }

  // Aucune ligne touchée : la fiche n'est pas rattachée à cette personne. On ne
  // le dit pas autrement que par « introuvable » — répondre « interdit »
  // confirmerait que la fiche existe.
  if (!data) {
    return NextResponse.json({ erreur: 'Fiche introuvable.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, maj_le: data.maj_le });
}
