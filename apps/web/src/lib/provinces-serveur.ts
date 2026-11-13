import { lireProvincesAGerer, rangerProvinces, type CarteProvince, type ProvinceAGerer } from './provinces';
import { supabaseServer } from './supabase-server';

/**
 * Les provinces, lues en base.
 *
 * La lecture passe par la table, sous RLS (migration 0080) : la base ne rend
 * les provinces qu'aux référents et à l'administration. Aucun filtre ici n'y
 * ajoute ni n'y retire quoi que ce soit — le contrôle d'accès est là-bas.
 *
 * Le chemin de l'écusson dans le stockage ne sort pas de ce module : la carte
 * n'a besoin que de savoir s'il y en a un. Les octets passent par
 * `/espace/provinces/<id>/image`, qui refait la vérification.
 */

type LigneProvince = {
  id: string;
  nom_de_la_province: string | null;
  ecusson_provincial: string | null;
  maj_le: string;
};

export async function listerProvinces(): Promise<CarteProvince[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('provinces').select('id, nom_de_la_province, ecusson_provincial, maj_le');
  return rangerProvinces(
    ((data as LigneProvince[] | null) ?? []).map((p) => ({
      id: p.id,
      nom_de_la_province: p.nom_de_la_province,
      a_un_ecusson: Boolean(p.ecusson_provincial),
      version: p.maj_le,
    })),
  );
}

/**
 * Les provinces telles que l'administration les gère, avec le nombre de loges
 * qui s'y rattachent (`provinces_a_gerer`, 0096). `null` si la base refuse —
 * elle seule tranche qui est administrateur.
 */
export async function provincesAGerer(): Promise<ProvinceAGerer[] | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('provinces_a_gerer');
  if (error) return null;
  return lireProvincesAGerer(data);
}

/**
 * Le chemin de l'écusson d'une province dans le stockage, ou `null` — qu'elle
 * n'existe pas, n'ait pas d'écusson, ou ne soit pas visible de qui demande.
 * Les trois cas se confondent à dessein.
 */
export async function cheminEcussonProvincial(id: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('provinces')
    .select('ecusson_provincial')
    .eq('id', id)
    .maybeSingle<{ ecusson_provincial: string | null }>();
  return data?.ecusson_provincial ?? null;
}
