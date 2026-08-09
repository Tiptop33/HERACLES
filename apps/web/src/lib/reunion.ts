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
  id: string;
  tenue_le: string;
  lieu: string | null;
  presents: number;
  excuses: number;
  absents: number;
  effectif: number;
  retiree: boolean;
  retire_par_nom: string | null;
};

export async function lireFeuilleDAppel(reunion: string): Promise<LigneDAppel[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('feuille_d_appel', { reunion_choisie: reunion });
  return (data as LigneDAppel[]) ?? [];
}

export async function lireRegistre(avecRetirees = false): Promise<LigneDeRegistre[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('registre_des_reunions', {
    avec_retirees: avecRetirees,
  });
  return (data as LigneDeRegistre[]) ?? [];
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
};

export function phraseDeRefusReunion(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS[code] ?? 'L’appel n’a pas pu être enregistré.';
}
