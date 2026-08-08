import { supabaseServer } from './supabase-server';

/**
 * Le journal d'un candidat : ce qui s'est passé, daté (migration 0021).
 *
 * Lire passe par `suivi_du_candidat()`, écrire par la table et sa RLS. Depuis
 * la migration 0027, les deux appliquent la même règle : **la loge**. Qui a le
 * droit de voir un dossier a le droit d'y écrire, de corriger et de retirer —
 * une règle de moins à retenir, et celle que l'usage réclamait.
 *
 * Ce qui reste étroit : on signe de son nom, et la correction directe du
 * texte en base demeure réservée à son auteur.
 */

export type LigneDeJournal = {
  id: string;
  /** Le jour de l'événement, pas celui de la saisie. */
  fait_le: string;
  nature: string | null;
  /**
   * Où en est la tâche : « En cours », « Terminer »… Une note ordinaire n'en a
   * pas — c'est ce qui sépare ce qui s'est passé de ce qui reste à faire.
   */
  etat: string | null;
  texte: string;
  auteur_nom: string | null;
  /**
   * Qui a changé l'état en dernier (migration 0024). Vide tant que personne
   * n'y a touché depuis HERACLES — le cas des tâches reprises de Bubble.
   */
  etat_par_nom: string | null;
  /**
   * Qui a corrigé le texte en dernier (migration 0025). Corriger la note d'un
   * collègue est permis ; le taire ne le serait pas.
   */
  modifie_par_nom: string | null;
  /**
   * L'écran a-t-il le droit de proposer de refermer, corriger ou retirer ?
   * Faux pour une administratrice sans fiche de référent : elle lit, elle
   * n'agit pas.
   */
  je_peux_agir: boolean;
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
 * Les deux états que HERACLES pose lui-même.
 *
 * Ce sont les mots de Bubble, repris à l'identique — « Terminer » est un
 * infinitif là où on attendrait un participe, mais c'est la valeur que portent
 * les 28 tâches déjà closes. En inventer une seconde ferait deux vocabulaires
 * pour la même chose, et deux façons de compter.
 *
 * Les cinq valeurs relevées restent lisibles à l'écran ; seules ces deux-ci
 * s'écrivent.
 */
export const A_FAIRE = 'En cours';
export const TERMINEE = 'Terminer';

/**
 * Ce que les routes du suivi répondent quand elles refusent, en français.
 *
 * Les routes renvoient un **code** dans l'adresse, jamais la phrase : un
 * message porté par l'URL est un message qu'un lien fabriqué peut faire dire
 * ce qu'il veut. La traduction se fait ici, une fois, pour les deux écrans qui
 * savent écrire — la fiche et « Action / Candidat ».
 */
const REFUS: Record<string, string> = {
  vide: 'Une note vide ne dit rien.',
  droit: 'Ce candidat n’est pas de vos loges : vous ne pouvez pas écrire dans son journal.',
  'sans-fiche': 'Votre compte n’est rattaché à aucune fiche de référent.',
  introuvable: 'Ce candidat n’existe plus.',
  etat: 'Cet état ne se pose pas ici.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'La note n’a pas pu être enregistrée.',
};

/** La phrase à afficher pour un code de refus, ou `null` s'il n'y en a pas. */
export function phraseDeRefus(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS[code] ?? 'La note n’a pas pu être enregistrée.';
}

/**
 * Cette ligne est-elle une tâche encore ouverte ? Une note saisie dans
 * HERACLES n'a pas d'état : ce n'est pas une tâche, et elle ne répond pas oui.
 */
export function tacheOuverte(etat: string | null | undefined): boolean {
  const mot = etat?.trim();
  if (!mot) return false;
  return !ETAT_CLOS.test(mot);
}

/**
 * Ai-je quelqu'un à mettre en auteur ? Autrement dit : mon compte est-il
 * rattaché à une fiche de référent (migration 0027) ?
 *
 * Depuis que toute la loge écrit, c'est la seule condition qui reste — la
 * lecture porte le droit. Une administratrice sans fiche lit les journaux et
 * n'y écrit pas ; la policy la refuserait de toute façon.
 */
export async function jeSuisReferent(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('je_suis_referent');
  return data === true;
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

/**
 * Une note écartée du journal (migration 0025). Elle n'est pas effacée : on la
 * lit encore, on sait qui l'a retirée, et elle se rend.
 */
export type LigneRetiree = {
  id: string;
  fait_le: string;
  texte: string;
  auteur_nom: string | null;
  retire_par_nom: string | null;
  retire_le: string | null;
  je_peux_agir: boolean;
};

/**
 * Ce qui a été retiré du journal d'un candidat.
 *
 * C'est ce qui fait la différence entre retirer et effacer : sans cette
 * liste, le retrait doux ne serait qu'une suppression avec une colonne en
 * plus.
 */
export async function lireRetirees(candidat: string): Promise<LigneRetiree[]> {
  if (!/^[0-9a-f-]{36}$/i.test(candidat)) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('suivi_retire_du_candidat', { candidat });
  return (data as LigneRetiree[]) ?? [];
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
