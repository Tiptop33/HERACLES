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
    libelle: 'Mise en page',
    vers: '/espace/parametres/mise-en-page',
    propos:
      'La présentation du compte rendu, de l’affiche et de l’affichette : textes, tailles, couleurs, ' +
      'colonnes et emblèmes. Chaque changement s’enregistre aussitôt et se voit dans l’aperçu.',
  },
  {
    libelle: 'Archives',
    vers: '/espace/parametres/archives',
    propos:
      'Les comptes rendus, affiches et affichettes des exercices précédents. Ceux de l’exercice ' +
      'en cours sont à l’accueil.',
  },
  {
    libelle: 'Loges',
    vers: null,
    propos: 'Les loges, leurs noms et leurs emblèmes.',
    lot: 'lot 5',
  },
  {
    libelle: 'Loges de Guyenne et Gascogne',
    vers: '/espace/parametres/loges-du-reseau',
    propos:
      'Les 73 loges de Guyenne et Gascogne, leur Secrétaire, et le lien qui lui permet de cocher les secteurs ' +
      'd’activité de sa loge. Chaque changement s’enregistre aussitôt.',
  },
  {
    libelle: "Secteurs d'activité",
    vers: '/espace/parametres/secteurs-d-activite',
    propos:
      'Les secteurs de l’ancienne application Bubble, et le secteur de la nomenclature qui leur ' +
      'correspond. Une correspondance validée s’applique aussitôt aux fiches qui n’ont pas encore ' +
      'de secteur, puis à chaque reprise jusqu’au 5 décembre ; le référent confirme ensuite sur la fiche.',
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
