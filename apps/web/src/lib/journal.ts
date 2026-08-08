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
  /**
   * Où en est la tâche, pour les lignes reprises de Bubble (migration 0023) :
   * « En cours », « Terminer »… Les notes saisies dans HERACLES n'en ont pas —
   * un journal se lit, il ne se coche pas.
   */
  etat: string | null;
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

/**
 * Les états que Bubble donnait pour close. Relevé du 8 août 2026 sur les 467
 * tâches : « En cours » (434), « Terminer » (28), « En attente » (3),
 * « Réalisé » (1), « A vérifier » (1).
 *
 * Comme pour `CLOTURE` et `ARCHIVER` (voir `suivi.ts`), c'est une liste de
 * choix que l'API rend en texte libre : rien ne garantit qu'elle ne gagnera
 * pas une valeur d'ici la bascule. D'où le sens de la règle — on nomme ce qui
 * ferme, et tout le reste reste ouvert. Une tâche close affichée « à faire »
 * fait perdre une seconde ; une tâche à faire affichée close se perd.
 */
const ETAT_CLOS = /^(termin|r[ée]alis|fait|clos|cl[oô]tur|abandonn|annul)/i;

/**
 * Cette ligne est-elle une tâche encore ouverte ? Une note saisie dans
 * HERACLES n'a pas d'état : ce n'est pas une tâche, et elle ne répond pas oui.
 */
export function tacheOuverte(etat: string | null | undefined): boolean {
  const mot = etat?.trim();
  if (!mot) return false;
  return !ETAT_CLOS.test(mot);
}

export async function lireJournal(candidat: string): Promise<LigneDeJournal[]> {
  if (!/^[0-9a-f-]{36}$/i.test(candidat)) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('suivi_du_candidat', { candidat });
  return (data as LigneDeJournal[]) ?? [];
}

/** « 3 notes · 1 tâche en cours », en tête de l'onglet. */
export function resumeDuJournal(lignes: LigneDeJournal[]): string {
  if (lignes.length === 0) return 'rien de noté pour l’instant';

  const notes = `${lignes.length} note${lignes.length > 1 ? 's' : ''}`;
  const ouvertes = lignes.filter((l) => tacheOuverte(l.etat)).length;
  if (ouvertes === 0) return notes;

  return `${notes} · ${ouvertes} tâche${ouvertes > 1 ? 's' : ''} en cours`;
}

/**
 * Combien de notes « Action / Candidat » montre par dossier avant de renvoyer
 * à la fiche.
 *
 * Cinq, parce que la reprise de Bubble donne une médiane de quatre tâches par
 * candidat : la majorité des dossiers s'affichent donc en entier, et le lien
 * n'apparaît que là où il sert. Les plus chargés en portent vingt-cinq — c'est
 * eux qu'il s'agit de ne pas dérouler sur un écran qui répond à « quoi de
 * neuf ? », et non à « tout ce qui s'est passé ».
 */
export const APERCU = 5;

/** Ce qu'un dossier montre, et ce qu'il renvoie à sa fiche. */
export type Apercu<T> = {
  visibles: T[];
  /** Les notes qui restent, à lire dans la fiche. */
  reste: number;
  /** Parmi elles, les tâches encore ouvertes — celles qu'on ne veut pas taire. */
  resteOuvert: number;
};

/**
 * Les premières notes d'un dossier, et le compte de ce qui suit.
 *
 * Le compte des tâches ouvertes qui restent est donné à part : le journal se
 * lit du plus récent au plus ancien, et rien ne garantit qu'une tâche en cours
 * soit récente. La replier sans le dire reviendrait à la perdre.
 */
export function apercuDuDossier<T extends { etat: string | null }>(
  notes: T[],
  combien: number = APERCU,
): Apercu<T> {
  const visibles = notes.slice(0, combien);
  const suite = notes.slice(combien);

  return {
    visibles,
    reste: suite.length,
    resteOuvert: suite.filter((n) => tacheOuverte(n.etat)).length,
  };
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
