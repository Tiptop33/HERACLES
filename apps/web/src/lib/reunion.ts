import { supabaseServer } from './supabase-server';

/**
 * Les réunions d'une loge, et l'appel de ses référents (migration 0036).
 *
 * Tout passe par des fonctions : les tables `reunion` et `appel` sont fermées
 * même aux sessions connectées. La règle est celle de la loge portée par sa
 * fiche de référent — et non `loges_visibles()`, qui y ajouterait les loges
 * des candidats qu'on accompagne. Juste pour ouvrir un dossier, faux pour
 * tenir un registre.
 */

/** Les trois états de l'appel. Ce sont les mots de Bubble, repris tels quels. */
export const PRESENT = 'Présent';
export const EXCUSE = 'Excusé';
export const ABSENT = 'Absent';

export const ETATS = [PRESENT, EXCUSE, ABSENT] as const;
export type EtatAppel = (typeof ETATS)[number];

export function estUnEtat(valeur: unknown): valeur is EtatAppel {
  return typeof valeur === 'string' && (ETATS as readonly string[]).includes(valeur);
}

/** Une ligne de la feuille d'appel : un référent, son état, son assiduité. */
export type LigneDAppel = {
  referent_id: string;
  nom: string | null;
  prenom: string | null;
  college: string | null;
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo: boolean;
  /**
   * Vide tant que personne ne l'a appelé. Ce n'est pas « absent » : l'un dit
   * qu'il manquait, l'autre qu'on n'en sait rien.
   */
  etat: EtatAppel | null;
  presences: number;
  excuses: number;
};

/** Une réunion au registre, avec ses comptes. */
export type LigneDeRegistre = {
  /**
   * Hors des bornes de l'exercice. Rendu par `la_reunion()` seulement : le
   * registre, lui, ne montre que l'exercice, donc la question ne s'y pose pas.
   */
  hors_exercice?: boolean;
  /**
   * Avant le début de l'exercice — donc un exercice précédent. Rendu par
   * `registre_hors_exercice()` seulement, où toutes les lignes débordent : il
   * reste à dire de quel côté.
   */
  avant?: boolean;
  id: string;
  tenue_le: string;
  lieu: string | null;
  presents: number;
  excuses: number;
  absents: number;
  effectif: number;
  retiree: boolean;
  retire_par_nom: string | null;
  /**
   * Le jour du retrait. Rendu par `registre_des_retirees()` seulement — c'est
   * la seule liste où la question se pose.
   */
  retire_le?: string | null;
  /**
   * Reprise de Bubble : elle se retire, elle ne s'efface pas. La prochaine
   * reprise la recréerait (migration 0041).
   */
  venue_de_bubble?: boolean;
};

export async function lireFeuilleDAppel(reunion: string): Promise<LigneDAppel[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('feuille_d_appel', { reunion_choisie: reunion });
  return (data as LigneDAppel[]) ?? [];
}

/**
 * Une réunion précise, par son identifiant — **sans passer par le registre**.
 *
 * C'est la correction de la migration 0037. Chercher la réunion ouverte dans
 * le registre paraissait économique, mais le registre ne rend que l'exercice
 * en cours : une réunion tenue hors bornes existait sans jamais s'afficher.
 * Le cas n'avait rien de théorique — l'exercice enregistré s'est terminé le
 * 31 juillet 2026.
 */
export async function lireUneReunion(reunion: string): Promise<LigneDeRegistre | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return null;

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('la_reunion', { reunion_choisie: reunion });
  return ((data as LigneDeRegistre[]) ?? [])[0] ?? null;
}

export async function lireRegistre(avecRetirees = false): Promise<LigneDeRegistre[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('registre_des_reunions', {
    avec_retirees: avecRetirees,
  });
  return (data as LigneDeRegistre[]) ?? [];
}

/**
 * Les réunions qui tombent hors des bornes de l'exercice (migration 0038).
 *
 * Des deux côtés : les exercices précédents, et les réunions tenues depuis la
 * clôture. Ce second cas n'a rien de théorique — l'exercice enregistré s'est
 * terminé le 31 juillet 2026, donc toute réunion tenue aujourd'hui atterrit
 * ici et nulle part ailleurs.
 */
export async function lireRegistreHorsExercice(): Promise<LigneDeRegistre[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('registre_hors_exercice');
  return (data as LigneDeRegistre[]) ?? [];
}

/**
 * Le droit d'effacer une réunion pour de bon (migration 0041).
 *
 * L'administrateur, le Vénérable Maître et le Secrétaire. Le pointage et le
 * retrait, eux, restent ouverts à toute la loge : ils se défont.
 *
 * La base refuse de toute façon — ceci ne sert qu'à ne pas montrer un geste
 * qui échouerait.
 */
export async function puisJeEffacerDesReunions(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('puis_je_effacer_des_reunions');
  return data === true;
}

/**
 * Les réunions retirées de la loge, toutes dates confondues (migration 0040).
 *
 * Sans cette liste, retirer une réunion revenait à la perdre : elle quittait
 * les deux registres, et il fallait connaître son adresse pour la rendre —
 * donc l'avoir notée avant de la retirer. « Retirer n'est pas effacer »
 * n'était vrai que pour qui avait pris ses précautions.
 */
export async function lireRegistreDesRetirees(): Promise<LigneDeRegistre[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('registre_des_retirees');
  return (data as LigneDeRegistre[]) ?? [];
}

/**
 * Les réunions rangées par date, de la plus ancienne à la plus récente.
 *
 * Le même ordre dans les trois cadres de l'écran — le registre de l'exercice,
 * les réunions retirées, le registre de l'exercice passé. Un registre se lit
 * en descendant les dates ; trois cadres rangés chacun à sa façon obligeaient
 * à réapprendre l'ordre à chaque fois qu'on baissait les yeux.
 *
 * Deux réunions peuvent tomber le même jour (migration 0046) : leur
 * identifiant les départage, sans quoi leur ordre serait celui que la base a
 * rendu, et deux affichages successifs ne se ressembleraient pas.
 *
 * La liste reçue n'est pas modifiée : `sort` trie sur place, et un tableau
 * rendu par une lecture n'a pas à changer sous les pieds de son appelant.
 */
export function rangerParDate(lignes: LigneDeRegistre[]): LigneDeRegistre[] {
  return [...lignes].sort(
    (a, b) => a.tenue_le.localeCompare(b.tenue_le) || a.id.localeCompare(b.id),
  );
}

/** Ce que l'en-tête de la feuille annonce : trois nombres, et rien d'autre. */
export function compter(lignes: LigneDAppel[]) {
  return {
    presents: lignes.filter((l) => l.etat === PRESENT).length,
    excuses: lignes.filter((l) => l.etat === EXCUSE).length,
    absents: lignes.filter((l) => l.etat === ABSENT).length,
    /** Ceux que personne n'a encore appelés. C'est le travail qui reste. */
    aAppeler: lignes.filter((l) => l.etat === null).length,
  };
}

/**
 * Ce que les routes de la réunion répondent quand elles refusent.
 *
 * Comme pour le suivi, les routes ne renvoient qu'un **code** dans l'adresse :
 * un message porté par l'URL est un message qu'un lien fabriqué peut faire
 * dire ce qu'il veut.
 */
const REFUS: Record<string, string> = {
  'sans-loge': 'Votre compte n’est rattaché à aucune loge : vous ne tenez aucun registre.',
  introuvable: 'Cette réunion n’existe pas, ou elle n’est pas de votre loge.',
  etat: 'Cet état n’existe pas : présent, excusé ou absent.',
  date: 'Cette date ne se lit pas.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'L’appel n’a pas pu être enregistré.',
  droit:
    'Seuls l’administrateur, le Vénérable Maître et le Secrétaire peuvent effacer une réunion.',
  bubble:
    'Cette réunion vient de Bubble : elle reviendrait à la prochaine reprise. Retirez-la du registre plutôt que de l’effacer.',
};

export function phraseDeRefusReunion(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS[code] ?? 'L’appel n’a pas pu être enregistré.';
}
