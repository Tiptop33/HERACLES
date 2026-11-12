import { z } from 'zod';

/**
 * Les secteurs d'activité — la nomenclature NAF de l'INSEE (migrations 0086 à
 * 0091, docs/secteurs-d-activite.md).
 *
 * Ce module est pur — lire, ranger, dater, construire l'arborescence — et sert
 * aussi bien au serveur qu'au navigateur. La lecture en base est dans
 * `secteurs-serveur.ts` : un composant client ne doit pas tirer avec lui le
 * client Supabase du serveur.
 */

export type NiveauNaf = 'section' | 'division' | 'groupe' | 'classe' | 'sous-classe';

/** Un secteur coché par une loge, avec sa division et sa section. */
export type SecteurCoche = {
  code: string;
  intitule: string;
  niveau: NiveauNaf;
  division: string;
  division_intitule: string;
  section: string;
  section_intitule: string;
};

/** Ce que le bloc affiche : la liste, sa date, et si la session peut la modifier. */
export type ListeDeLaLoge = {
  maj_le: string | null;
  modifiable: boolean;
  secteurs: SecteurCoche[];
};

/** Une réponse de la recherche par mot (`rechercher_secteur_pour_la_loge`). */
export type SecteurTrouve = {
  code: string;
  intitule: string;
  niveau: NiveauNaf;
  section: string;
  section_intitule: string;
  rang: number;
};

/** Une ligne de la nomenclature, en liste compacte : code, intitulé, niveau 1 à 5, parent. */
export type LigneNaf = [string, string, number, string | null];

const NIVEAUX = ['section', 'division', 'groupe', 'classe', 'sous-classe'] as const;

const Secteur = z.object({
  code: z.string(),
  intitule: z.string(),
  niveau: z.enum(NIVEAUX),
  division: z.string(),
  division_intitule: z.string(),
  section: z.string(),
  section_intitule: z.string(),
});

const Liste = z.object({
  maj_le: z.string().nullable(),
  modifiable: z.boolean(),
  secteurs: z.array(Secteur),
});

/**
 * Ce que la base a rendu, vérifié. `null` si la forme n'est pas la bonne :
 * mieux vaut un bloc absent qu'un bloc qui affiche n'importe quoi.
 */
export function lireListe(valeur: unknown): ListeDeLaLoge | null {
  const lu = Liste.safeParse(valeur);
  return lu.success ? lu.data : null;
}

/**
 * Un code qu'une loge peut cocher : de la division (« 43 ») à la sous-classe
 * (« 43.21A »). La base le vérifie aussi ; ceci évite d'y envoyer n'importe quoi.
 */
export const CODE_A_COCHER = /^[0-9]{2}(\.[0-9]([0-9][A-Z]?)?)?$/;

/** Le nom d'un niveau, tel que l'écran le dit. */
export const NOM_DU_NIVEAU: Record<NiveauNaf, string> = {
  section: 'grand secteur',
  division: 'division',
  groupe: 'groupe',
  classe: 'classe',
  'sous-classe': 'sous-classe',
};

/** Les secteurs cochés, rangés par grand secteur, dans l'ordre des codes. */
export function rangerParSection(
  secteurs: SecteurCoche[],
): { section: string; section_intitule: string; secteurs: SecteurCoche[] }[] {
  const groupes = new Map<string, { section: string; section_intitule: string; secteurs: SecteurCoche[] }>();
  for (const s of [...secteurs].sort((a, b) => a.code.localeCompare(b.code))) {
    const g = groupes.get(s.section) ?? { section: s.section, section_intitule: s.section_intitule, secteurs: [] };
    g.secteurs.push(s);
    groupes.set(s.section, g);
  }
  return [...groupes.values()].sort((a, b) => a.section.localeCompare(b.section));
}

/** « 9 secteurs cochés, dans 6 grands secteurs. » — ou rien si la liste est vide. */
export function resumeDeLaListe(secteurs: SecteurCoche[]): string {
  const n = secteurs.length;
  if (n === 0) return '';
  const g = new Set(secteurs.map((s) => s.section)).size;
  const pluriel = (k: number, mot: string) => `${k} ${mot}${k > 1 ? 's' : ''}`;
  return `${pluriel(n, 'secteur')} coché${n > 1 ? 's' : ''}, dans ${pluriel(g, 'grand')} ${g > 1 ? 'secteurs' : 'secteur'}.`;
}

/** Au-delà de six mois sans mise à jour, la date se signale. */
export const LISTE_ANCIENNE_JOURS = 183;

export function listeAncienne(majLe: string | null, maintenant: Date = new Date()): boolean {
  if (!majLe) return false;
  const date = new Date(majLe);
  if (Number.isNaN(date.getTime())) return false;
  return maintenant.getTime() - date.getTime() > LISTE_ANCIENNE_JOURS * 86_400_000;
}

/** « Mis à jour le 2 mars 2026 », ou « Jamais rempli ». */
export function dateDeLaListe(majLe: string | null): string {
  if (!majLe) return 'Jamais rempli';
  const date = new Date(majLe);
  if (Number.isNaN(date.getTime())) return 'Jamais rempli';
  return `Mis à jour le ${date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })}`;
}

/**
 * L'arborescence de la nomenclature, pour la liste à cocher.
 *
 * Une sous-classe qui répète mot pour mot l'intitulé de sa classe (« 35.11 »
 * et « 35.11Z — Production d'électricité ») n'y figure pas : la classe suffit,
 * comme dans la recherche (0090).
 */
export type Arbre = {
  parCode: Map<string, LigneNaf>;
  enfants: Map<string, LigneNaf[]>;
  sections: LigneNaf[];
};

export function construireArbre(lignes: LigneNaf[]): Arbre {
  const parCode = new Map(lignes.map((l) => [l[0], l]));
  const enfants = new Map<string, LigneNaf[]>();
  for (const l of lignes) {
    const parent = l[3];
    if (!parent) continue;
    const p = parCode.get(parent);
    if (l[2] === 5 && p && p[1] === l[1]) continue;
    const liste = enfants.get(parent) ?? [];
    liste.push(l);
    enfants.set(parent, liste);
  }
  for (const liste of enfants.values()) liste.sort((a, b) => a[0].localeCompare(b[0]));
  const sections = lignes.filter((l) => l[2] === 1).sort((a, b) => a[0].localeCompare(b[0]));
  return { parCode, enfants, sections };
}

/**
 * Combien de codes cochés se trouvent sous cette ligne, elle exclue. Sous une
 * section, on passe par la division : son code (« 43 ») ne dit pas sa lettre.
 */
export function cochesDessous(ligne: LigneNaf, coches: string[], arbre: Arbre): number {
  const [code, , niveau] = ligne;
  return coches.filter((c) => {
    if (c === code) return false;
    if (niveau === 1) return arbre.parCode.get(c.slice(0, 2))?.[3] === code;
    return c.startsWith(code);
  }).length;
}
