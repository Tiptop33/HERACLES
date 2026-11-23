import type { Offre } from './accueil';
import { lireMenus, type FiltresDesOffres, type MenusDesOffres } from './offres';
import { supabaseServer } from './supabase-server';

/**
 * Les offres de l'écran « France Travail », lues en base (migration 0097).
 *
 * Les deux lectures passent par des fonctions de la base, appelées avec la
 * session de la personne : c'est la base qui refuse un compte chercheur, qui
 * déduit le département et le secteur de chaque offre, et qui borne la liste.
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

/** Les offres en cours qui répondent aux filtres, les plus récentes d'abord. */
export async function listerOffresFiltrees(
  filtres: FiltresDesOffres,
  limite: number,
): Promise<Offre[] | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('offres_en_cours', {
    les_departements: filtres.departements,
    le_secteur: filtres.secteur || null,
    limite,
  });
  if (error) return null;
  return (data as Offre[] | null) ?? [];
}
