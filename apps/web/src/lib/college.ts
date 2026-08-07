import { supabaseServer } from './supabase-server';

/**
 * Les titres du collège — Vénérable Maître, Secrétaire, Trésorier…
 *
 * Un référentiel, tenu par l'administration (migration 0017). Le champ
 * « Collège » d'un référent y puise sa liste, mais n'y est pas contraint :
 * `referent.college` reste du texte, et une fiche qui porte un titre retiré de
 * la liste le garde.
 */

export type TitreCollege = {
  id: string;
  nom: string;
  rang: number;
  /** Combien de référents portent ce titre aujourd'hui. */
  utilisations: number;
};

/**
 * La liste complète, dans l'ordre voulu. Passe par une fonction de la base :
 * compter les référents d'un titre suppose de lire des fiches que l'appelant
 * n'a pas le droit de lire.
 */
export async function listerCollege(): Promise<TitreCollege[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('liste_college');
  return (data as TitreCollege[]) ?? [];
}

/** Les seuls noms, pour remplir un menu déroulant. */
export async function nomsDuCollege(): Promise<string[]> {
  return (await listerCollege()).map((t) => t.nom);
}

/**
 * Les choix à proposer pour une fiche, la valeur qu'elle porte comprise.
 *
 * Une fiche reprise de Bubble peut porter un titre qui n'est pas dans la
 * liste — ou qui en a été retiré depuis. Sans cette précaution, ouvrir la
 * fiche et l'enregistrer sans y toucher effacerait ce titre : le menu
 * déroulant aurait choisi à la place de la personne.
 */
export function choixDeCollege(titres: string[], valeur: string | null): string[] {
  const actuel = valeur?.trim();
  if (!actuel) return titres;

  const deja = titres.some((t) => t.toLowerCase() === actuel.toLowerCase());
  return deja ? titres : [...titres, actuel];
}
