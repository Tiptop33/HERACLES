import { lireSecteursDuCandidat, type SecteursDuCandidat } from './secteurs';
import { supabaseServer } from './supabase-server';

/**
 * Les secteurs d'un candidat, pour le bloc « Sa recherche » de sa fiche, ou
 * `null` pour qui ne lit pas la fiche. Le contrôle est dans la base
 * (`secteurs_du_candidat`, 0092) : mêmes droits que la fiche.
 */
export async function lireLesSecteursDuCandidat(candidat: string): Promise<SecteursDuCandidat | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('secteurs_du_candidat', { le_candidat: candidat });
  if (error) return null;
  return lireSecteursDuCandidat(data);
}
