import { z } from 'zod';

/**
 * Les provinces — table `provinces`, ses deux champs `nom_de_la_province` et
 * `ecusson_provincial` (migrations 0080 et 0096).
 *
 * Ce module est pur : il sert au serveur comme au navigateur. La lecture en
 * base est dans `provinces-serveur.ts`.
 */

/** Une province, telle que sa carte la montre à un référent. */
export type CarteProvince = {
  id: string;
  nom_de_la_province: string | null;
  /** Un écusson rapatrié de Bubble ou déposé, servi par /espace/provinces/<id>/image. */
  a_un_ecusson: boolean;
  /** Change quand l'écusson change : l'adresse de l'image change avec, et aucun cache ne sert l'ancien. */
  version: string;
};

/** Une province, telle que l'administration la gère (`provinces_a_gerer`, 0096). */
export type ProvinceAGerer = {
  id: string;
  nom_de_la_province: string | null;
  a_un_ecusson: boolean;
  /** Change quand l'écusson change : voir `CarteProvince.version`. */
  maj_le: string;
  /** Les loges de l'application qui s'y rattachent. */
  loges: number;
  /** Les loges de Guyenne et Gascogne qui s'y rattachent. */
  loges_du_reseau: number;
};

const Gestion = z.object({
  id: z.string(),
  nom_de_la_province: z.string().nullable(),
  a_un_ecusson: z.boolean(),
  maj_le: z.string(),
  loges: z.number().int().nonnegative(),
  loges_du_reseau: z.number().int().nonnegative(),
});

/** La réponse de `provinces_a_gerer`, vérifiée et rangée ; les lignes mal formées sont écartées. */
export function lireProvincesAGerer(valeur: unknown): ProvinceAGerer[] {
  if (!Array.isArray(valeur)) return [];
  return rangerProvinces(
    valeur.flatMap((v) => {
      const lu = Gestion.safeParse(v);
      return lu.success ? [lu.data] : [];
    }),
  );
}

/** Ce que l'écran envoie pour ajouter ou renommer une province. La base redit les mêmes règles (0096). */
export const ChampsDeLaProvince = z
  .object({
    nom_de_la_province: z
      .string('Le nom de la province est obligatoire.')
      .trim()
      .min(1, 'Le nom de la province est obligatoire.')
      .max(120, 'Ce nom de province est trop long : 120 caractères au plus.'),
  })
  .strict();

/** Un écusson se dépose en image : JPEG, PNG, WebP, GIF ou AVIF, 5 Mo au plus. */
export const TAILLE_MAXIMALE_ECUSSON_PROVINCIAL = 5 * 1024 * 1024;

/** Le nom à écrire sur une carte, même quand la reprise ne l'a pas apporté. */
export function nomAffiche(nom: string | null | undefined): string {
  return nom?.trim() || 'Province sans nom';
}

/**
 * La question posée avant de retirer une province : elle dit combien de loges
 * n'auront plus de province (décision du 13 novembre 2026).
 */
export function questionDuRetrait(p: Pick<ProvinceAGerer, 'nom_de_la_province' | 'loges' | 'loges_du_reseau'>): string {
  const nom = nomAffiche(p.nom_de_la_province);
  const parts = [
    p.loges ? `${p.loges} loge${p.loges > 1 ? 's' : ''}` : null,
    p.loges_du_reseau
      ? `${p.loges_du_reseau} loge${p.loges_du_reseau > 1 ? 's' : ''} de Guyenne et Gascogne`
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return `Retirer la province « ${nom} » ?`;
  const total = p.loges + p.loges_du_reseau;
  return (
    `Retirer la province « ${nom} » ?\n\n` +
    `${parts.join(' et ')} n’${total > 1 ? 'auront' : 'aura'} plus de province.`
  );
}

/**
 * Dans l'ordre alphabétique français, les provinces sans nom à la fin : une
 * reprise incomplète ne doit pas pousser les vraies hors de vue.
 */
export function rangerProvinces<T extends { nom_de_la_province: string | null }>(provinces: T[]): T[] {
  return [...provinces].sort((a, b) => {
    const na = a.nom_de_la_province?.trim() ?? '';
    const nb = b.nom_de_la_province?.trim() ?? '';
    if (!na && !nb) return 0;
    if (!na) return 1;
    if (!nb) return -1;
    return na.localeCompare(nb, 'fr', { sensitivity: 'base' });
  });
}

/**
 * La lettre qui tient la place de l'écusson tant qu'il n'est pas là — comme
 * les initiales d'un référent sans photo.
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

/** L'adresse de l'écusson d'une province, qui change avec lui. */
export function adresseDeLEcusson(id: string, version: string | number): string {
  return `/espace/provinces/${id}/image?v=${encodeURIComponent(String(version))}`;
}
