import type { MaFiche } from './espace-candidat';
import { supabaseServer } from './supabase-server';

/**
 * La fiche du candidat connecté, ou `null`.
 *
 * Par sa session, donc par `ma_fiche()` (migration 0060) : la base ne rend que
 * la fiche dont le compte est titulaire, et rien de ce que la commission y
 * écrit. Aucune clé service_role ici.
 */
export async function lireMaFiche(): Promise<MaFiche | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('ma_fiche');
  if (error || !data || data.length === 0) return null;
  return data[0] as MaFiche;
}
