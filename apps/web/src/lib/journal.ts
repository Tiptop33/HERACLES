import { supabaseServer } from './supabase-server';

/**
 * Le journal d'un candidat : ce qui s'est passé, daté (migration 0021).
 *
 * Lire passe par `suivi_du_candidat()`, qui applique la règle de la fiche —
 * la loge. Écrire passe par la table, donc par la RLS : le référent et le
 * parrain, personne d'autre. Les deux ne se ressemblent pas parce qu'elles ne
 * répondent pas à la même question.
 */

export type LigneDeJournal = {
  id: string;
  /** Le jour de l'événement, pas celui de la saisie. */
  fait_le: string;
  nature: string | null;
  texte: string;
  auteur_nom: string | null;
  /** Le mien : l'écran ne propose de corriger que ce qu'on a écrit. */
  c_est_moi: boolean;
  cree_le: string | null;
};

/**
 * Les natures qu'on propose. Ce n'est pas une contrainte — le champ reste
 * libre —, seulement ce qui revient le plus souvent, pour éviter d'écrire
 * « appel », « Appel » et « appel téléphonique » dans la même colonne.
 *
 * À faire passer en référentiel, comme le collège, quand quelques semaines
 * d'usage auront dit lesquelles servent vraiment.
 */
export const NATURES = [
  'Appel',
  'Message',
  'Rendez-vous',
  'Entretien',
  'Candidature envoyée',
  'Relance',
  'Document reçu',
] as const;

export async function lireJournal(candidat: string): Promise<LigneDeJournal[]> {
  if (!/^[0-9a-f-]{36}$/i.test(candidat)) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('suivi_du_candidat', { candidat });
  return (data as LigneDeJournal[]) ?? [];
}

/** « 3 notes · la dernière il y a 5 jours », en tête de l'onglet. */
export function resumeDuJournal(lignes: LigneDeJournal[]): string {
  if (lignes.length === 0) return 'rien de noté pour l’instant';
  return `${lignes.length} note${lignes.length > 1 ? 's' : ''}`;
}

/** Une note, avec le candidat auquel elle se rattache. */
export type LigneDeLaLoge = LigneDeJournal & { candidat_id: string };

/**
 * Toutes les notes qu'on a le droit de lire, du plus récent au plus ancien
 * (migration 0022). Même règle que la fiche : cette liste épargne d'ouvrir
 * cent sept dossiers, elle n'en ouvre aucun de plus.
 */
export async function lireJournalDeLaLoge(): Promise<LigneDeLaLoge[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('suivi_de_la_loge');
  return (data as LigneDeLaLoge[]) ?? [];
}

/** Les notes rangées par candidat, du plus récemment touché au plus ancien. */
export function parCandidat<T extends { candidat_id: string }>(
  lignes: T[],
): Map<string, T[]> {
  const par = new Map<string, T[]>();
  // `lignes` arrive déjà triée par date décroissante : en la parcourant dans
  // l'ordre, chaque groupe garde ce tri, et le premier candidat rencontré est
  // celui dont la note est la plus fraîche.
  for (const l of lignes) {
    const deja = par.get(l.candidat_id);
    if (deja) deja.push(l);
    else par.set(l.candidat_id, [l]);
  }
  return par;
}
