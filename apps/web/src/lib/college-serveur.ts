import { supabaseServer } from './supabase-server';
import type { TitreCollege } from './college';

/**
 * Ce que la base rend des titres du collège.
 *
 * Séparé de `college.ts` — qui ne contient que des fonctions pures — parce que
 * la liste est affichée par un composant client : lui faire importer un module
 * qui touche à `next/headers` embarquerait le serveur dans le navigateur, et
 * la construction échoue, à juste titre.
 */

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
