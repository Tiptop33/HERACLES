import { lireListe, type ListeDeLaLoge } from './secteurs';
import { supabaseServer } from './supabase-server';

/**
 * La liste des secteurs d'une loge, ou `null` pour qui n'a pas à la voir (ni
 * de la loge, ni administrateur). Le contrôle est dans la base
 * (`secteurs_de_la_loge`, 0091), pas ici.
 */
export async function lireSecteursDeLaLoge(loge: string): Promise<ListeDeLaLoge | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('secteurs_de_la_loge', { la_loge: loge });
  if (error) return null;
  return lireListe(data);
}
