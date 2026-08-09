/**
 * Les rubriques des paramètres — le volet de gauche de l'écran.
 *
 * Même parti pris que la colonne de navigation : celles dont l'écran n'existe
 * pas encore restent **visibles et éteintes**, à leur place définitive. Un
 * menu qui grandit lot après lot déplace les repères à chaque fois.
 */

export type Rubrique = {
  libelle: string;
  /** L'adresse, ou `null` tant que l'écran n'existe pas. */
  vers: string | null;
  /** Ce qu'elle règle, en une ligne — sous le titre du volet de droite. */
  propos: string;
  /** Le lot qui l'apportera, pour l'infobulle des rubriques éteintes. */
  lot?: string;
};

export const RUBRIQUES: readonly Rubrique[] = [
  {
    libelle: 'Collège',
    vers: '/espace/parametres/college',
    propos: 'Les titres qu’un référent peut porter, dans l’ordre où vous les voulez.',
  },
  {
    libelle: 'Exercice',
    vers: '/espace/parametres/exercice',
    propos: 'Les dates entre lesquelles se comptent les réunions et l’assiduité.',
  },
  {
    libelle: 'Loges',
    vers: null,
    propos: 'Les loges, leurs noms et leurs emblèmes.',
    lot: 'lot 5',
  },
  {
    libelle: "Secteurs d'activité",
    vers: null,
    propos: 'Les secteurs proposés sur la fiche d’un candidat.',
    lot: 'lot 5',
  },
  {
    libelle: 'Types de document',
    vers: null,
    propos: 'Les catégories sous lesquelles se rangent les documents.',
    lot: 'lot 5',
  },
];

/** La rubrique ouverte, d'après l'adresse courante. */
export function rubriqueCourante(chemin: string): Rubrique | null {
  return RUBRIQUES.find((r) => r.vers && chemin.startsWith(r.vers)) ?? null;
}
