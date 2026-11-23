import {
  OFFRES_PAR_PAGE,
  lireMenus,
  lirePage,
  type FiltresDesOffres,
  type MenusDesOffres,
  type PageDOffres,
} from './offres';
import { supabaseServer } from './supabase-server';

/**
 * Les offres de l'écran « France Travail », lues en base (migration 0097).
 *
 * Les deux lectures passent par des fonctions de la base, appelées avec la
 * session de la personne : c'est la base qui refuse un compte chercheur, qui
 * déduit le département et le secteur de chaque offre, et qui découpe la liste en pages.
 * `null` quand elle refuse ou ne répond pas — l'écran le dit, plutôt que de
 * montrer une liste vide qui se lirait « aucune offre ».
 */

/** Les départements et les secteurs qui portent au moins une offre en cours. */
export async function lireMenusDesOffres(): Promise<MenusDesOffres | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('filtres_des_offres');
  if (error) return null;
  return lireMenus(data);
}

/**
 * La page demandée des offres en cours qui répondent aux filtres et aux mots
 * cherchés (0100), les plus récentes d'abord, et le total — qui dit combien
 * de pages il y a.
 */
export async function lirePageDOffres(filtres: FiltresDesOffres): Promise<PageDOffres | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('offres_en_cours', {
    les_departements: filtres.departements,
    le_secteur: filtres.secteur || null,
    limite: OFFRES_PAR_PAGE,
    decalage: (filtres.page - 1) * OFFRES_PAR_PAGE,
    la_recherche: filtres.recherche || null,
  });
  if (error) return null;
  return lirePage(data);
}
