import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { lireCorps, origine, retourAvecCode, vientDUnFormulaire } from '@/lib/formulaire';

/**
 * Corriger la fiche d'un référent. **Réservé aux administrateurs.**
 *
 * Ce formulaire ne connaît que six champs, et ce n'est pas une politesse : la
 * base n'accorde l'écriture que sur ces six colonnes-là (migration 0012).
 * `profil_id` et `bubble_id` — le rattachement au compte, la trace de la
 * reprise — restent hors d'atteinte même si quelqu'un les ajoutait ici.
 *
 * Aucun mot de passe. L'écran de Bubble en proposait un ; HERACLES ne permet
 * nulle part de choisir celui d'un autre. Pour rendre l'accès, on renvoie une
 * invitation, et la personne choisit le sien.
 */

const texte = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((valeur) => (valeur === '' ? null : valeur))
    .nullable()
    .optional();

const Formulaire = z.object({
  nom: texte(120),
  prenom: texte(120),
  telephone: texte(40),
  college: texte(120),
  email: texte(320).refine((v) => v == null || z.email().safeParse(v).success, {
    message: "L'adresse e-mail n'est pas valide.",
  }),
  loge_id: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || z.uuid().safeParse(v).success, { message: 'Loge inconnue.' }),
});

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await traiter(requete, params);
  } catch (souci) {
    console.error('[referents] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

async function traiter(requete: Request, params: Promise<{ id: string }>) {
  const { id } = await params;
  const natif = vientDUnFormulaire(requete);

  const refuser = (code: string, message: string, statut = 400) => {
    if (natif) return retourAvecCode(requete, `/espace/referents/${id}/modifier`, { erreur: code });
    return NextResponse.json({ erreur: message }, { status: statut });
  };

  if (!z.uuid().safeParse(id).success) return refuser('inconnu', 'Fiche inconnue.', 404);

  const lu = Formulaire.safeParse(await lireCorps(requete));
  if (!lu.success) {
    return refuser('formulaire', lu.error.issues[0]?.message ?? 'Formulaire invalide.');
  }

  // La session d'abord. Le droit ensuite — et c'est la base qui le dit : la
  // policy `referent_modification_admin` ne donne aucune ligne à qui n'est pas
  // administrateur. Rien n'est filtré ici, `eq` ne fait que viser la fiche.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuser('session', 'Session expirée.', 401);

  const { data, error } = await supabase
    .from('referent')
    .update(lu.data)
    .eq('id', id)
    .select('id');

  if (error) return refuser('echec', "L'enregistrement a échoué.", 400);

  // Aucune ligne touchée : soit la fiche n'existe pas, soit la policy a
  // refusé. On ne distingue pas les deux — le dire renseignerait sur ce qui
  // existe ailleurs.
  if (!data || data.length === 0) {
    return refuser('refus', "Cette fiche n'est pas modifiable.", 403);
  }

  if (natif) {
    return NextResponse.redirect(new URL('/espace/referents', origine(requete)), 303);
  }
  return NextResponse.json({ ok: true, redirection: '/espace/referents' });
}
