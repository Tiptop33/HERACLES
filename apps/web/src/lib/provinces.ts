import { supabaseServer } from './supabase-server';

/**
 * Les provinces, telles que les cartes de l'écran « Province » les montrent.
 *
 * La lecture passe par la table, sous RLS (migration 0080) : la base ne rend
 * les provinces qu'aux référents et à l'administration. Aucun filtre ici n'y
 * ajoute ni n'y retire quoi que ce soit — le contrôle d'accès est là-bas.
 *
 * Le chemin de l'image dans le stockage ne sort pas de ce module : la carte
 * n'a besoin que de savoir s'il y en a une. Les octets passent par
 * `/espace/provinces/<id>/image`, qui refait la vérification.
 */

export type CarteProvince = {
  id: string;
  nom: string | null;
  /** Une image rapatriée de Bubble, servie par /espace/provinces/<id>/image. */
  a_une_image: boolean;
};

type LigneProvince = { id: string; nom: string | null; image_chemin: string | null };

export async function listerProvinces(): Promise<CarteProvince[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('province').select('id, nom, image_chemin');
  return rangerProvinces(
    ((data as LigneProvince[] | null) ?? []).map((p) => ({
      id: p.id,
      nom: p.nom,
      a_une_image: Boolean(p.image_chemin),
    })),
  );
}

/**
 * Le chemin de l'image d'une province dans le stockage, ou `null` — qu'elle
 * n'existe pas, n'ait pas d'image rapatriée, ou ne soit pas visible de qui
 * demande. Les trois cas se confondent à dessein.
 */
export async function cheminImageProvince(id: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('province')
    .select('image_chemin')
    .eq('id', id)
    .maybeSingle<{ image_chemin: string | null }>();
  return data?.image_chemin ?? null;
}

/**
 * Dans l'ordre alphabétique français, les provinces sans nom à la fin : une
 * reprise incomplète ne doit pas pousser les vraies hors de vue.
 */
export function rangerProvinces<T extends { nom: string | null }>(provinces: T[]): T[] {
  return [...provinces].sort((a, b) => {
    const na = a.nom?.trim() ?? '';
    const nb = b.nom?.trim() ?? '';
    if (!na && !nb) return 0;
    if (!na) return 1;
    if (!nb) return -1;
    return na.localeCompare(nb, 'fr', { sensitivity: 'base' });
  });
}

/**
 * La lettre qui tient la place de l'image tant qu'elle n'est pas rapatriée —
 * comme les initiales d'un référent sans photo.
 *
 * Le mot « Province » et l'article qui le suit sont sautés : sinon toutes les
 * cartes de « Province de… » porteraient le même P, et la lettre ne
 * distinguerait plus rien.
 */
export function initialeDeProvince(nom: string | null | undefined): string {
  const propre = (nom ?? '')
    .trim()
    .replace(/^province\s+(?:de\s+la\s+|de\s+l['’]\s*|des\s+|du\s+|de\s+|d['’]\s*)?/i, '')
    .trim();
  const premiere = propre.match(/\p{L}|\p{N}/u)?.[0];
  return premiere ? premiere.toLocaleUpperCase('fr') : '?';
}
