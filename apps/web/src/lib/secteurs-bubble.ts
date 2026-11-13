import { z } from 'zod';

/**
 * Paramètres › Secteurs d'activité : les secteurs de l'ancienne application
 * Bubble et leur correspondant dans la nomenclature NAF (migration 0093,
 * maquette validée le 13 novembre 2026 : docs/maquettes/secteurs-repris-de-bubble.html).
 *
 * Deux sources sur les fiches Bubble : la liste « SECTEUR ACTIVITE ROME » et
 * le texte libre « Candidat_SA ». Le code NAF que certaines fiches portaient
 * déjà passe d'office, sans paraître ici.
 */

export type SourceBubble = 'rome' | 'texte';
export type EtatDuSecteurBubble = 'a_valider' | 'valide' | 'sans';

const SecteurNaf = z.object({
  code: z.string(),
  intitule: z.string(),
  niveau: z.enum(['section', 'division']),
  section: z.string(),
  section_intitule: z.string(),
});
export type SecteurNaf = z.infer<typeof SecteurNaf>;

const LigneBubble = z.object({
  source: z.enum(['rome', 'texte']),
  valeur: z.string(),
  libelle: z.string().nullable(),
  fiches: z.number().int().nonnegative(),
  etat: z.enum(['a_valider', 'valide', 'sans']),
  code: SecteurNaf.nullable(),
  propose: SecteurNaf.extend({ mot: z.string().nullable() }).nullable(),
  valide_le: z.string().nullable(),
});
export type SecteurBubble = z.infer<typeof LigneBubble>;

/** Ce que la base rend, vérifié ; une ligne mal formée est écartée plutôt que d'arrêter l'écran. */
export function lireSecteursBubble(brut: unknown): SecteurBubble[] {
  if (!Array.isArray(brut)) return [];
  return brut.flatMap((l) => {
    const lu = LigneBubble.safeParse(l);
    return lu.success ? [lu.data] : [];
  });
}

/** La clé d'une ligne, pour React et pour savoir laquelle est ouverte. */
export const cleDeLaLigne = (l: Pick<SecteurBubble, 'source' | 'valeur'>) => `${l.source}:${l.valeur}`;

export const NOM_DE_LA_SOURCE: Record<SourceBubble, string> = {
  rome: 'liste ROME',
  texte: 'texte libre',
};

/** « Bubble · liste ROME · 3 fiches » */
export function origineDeLaLigne(l: Pick<SecteurBubble, 'source' | 'fiches'>): string {
  return `Bubble · ${NOM_DE_LA_SOURCE[l.source]} · ${l.fiches} fiche${l.fiches > 1 ? 's' : ''}`;
}

/** Un secteur ROME dont la liste n'a pas été reprise n'a pas d'intitulé : on le dit. */
export const libelleDeLaLigne = (l: Pick<SecteurBubble, 'libelle'>) =>
  l.libelle ?? 'Intitulé absent de la reprise';

/** Le secteur affiché à droite de la flèche : retenu, ou à défaut proposé. */
export const cibleDeLaLigne = (l: SecteurBubble) => (l.etat === 'valide' ? l.code : l.etat === 'a_valider' ? l.propose : null);

/** « grand secteur » pour une section, « F — Construction » pour une division. */
export const sousLeSecteur = (s: SecteurNaf) =>
  s.niveau === 'section' ? 'grand secteur' : `${s.section} — ${s.section_intitule}`;

/** « 13 nov. », à l'heure de Paris : le serveur et le navigateur écrivent la même date. */
export function dateCourte(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
}

export type FiltreBubble = 'tous' | 'a_valider' | 'valide' | 'sans';

export const FILTRES_BUBBLE: readonly (readonly [FiltreBubble, string])[] = [
  ['tous', 'Tous'],
  ['a_valider', 'À valider'],
  ['valide', 'Validés'],
  ['sans', 'Sans correspondance'],
];

export const filtrerSecteursBubble = (lignes: SecteurBubble[], filtre: FiltreBubble) =>
  filtre === 'tous' ? lignes : lignes.filter((l) => l.etat === filtre);

export function compterSecteursBubble(lignes: SecteurBubble[]) {
  return {
    total: lignes.length,
    valides: lignes.filter((l) => l.etat === 'valide').length,
    a_valider: lignes.filter((l) => l.etat === 'a_valider').length,
    sans: lignes.filter((l) => l.etat === 'sans').length,
  };
}

/** Ce que la route reçoit : le secteur Bubble, et le code retenu (vide = aucun ne convient). */
export const ReglageDuSecteurBubble = z
  .object({
    source: z.enum(['rome', 'texte'], 'Cette source n’existe pas.'),
    valeur: z.string().trim().min(1, 'Ce secteur Bubble est vide.').max(500, 'Ce secteur Bubble est trop long.'),
    code: z
      .string()
      .trim()
      .regex(/^([A-U]|[0-9]{2})$/, 'Choisissez un grand secteur ou une division.')
      .nullable(),
  })
  .strict();
