import type { Role } from './roles';

/**
 * La colonne de gauche, telle que la maquette `1a` la redessine.
 *
 * L'application Bubble alignait dix-sept entrées à plat. On garde la colonne —
 * les référents la connaissent, et la bascule du 5 décembre n'est pas le jour
 * pour les désorienter — mais on la range en cinq familles.
 *
 * Les entrées dont l'écran n'existe pas encore restent **visibles et
 * éteintes**, à leur place définitive. Une colonne qui grandit lot après lot
 * déplace les repères à chaque fois ; une colonne complète dès le début se
 * remplit sans jamais bouger.
 */

export type Entree = {
  libelle: string;
  /** L'adresse, ou `null` tant que l'écran n'existe pas. */
  vers: string | null;
  /** Le lot qui l'apportera — pour l'infobulle des entrées éteintes. */
  lot?: string;
};

export type Famille = {
  nom: string;
  /** Les rôles qui voient cette famille. Absent : tout le monde la voit. */
  rolesAutorises?: readonly Role[];
  entrees: readonly Entree[];
};

export const FAMILLES: readonly Famille[] = [
  {
    nom: 'Suivi',
    entrees: [
      { libelle: 'Candidats', vers: '/espace/candidats' },
      { libelle: 'Action / Candidat', vers: null, lot: 'lot 4' },
      { libelle: 'Relation', vers: null, lot: 'lot 4' },
      { libelle: 'Messagerie', vers: null, lot: 'lot 5' },
    ],
  },
  {
    nom: 'Emploi',
    entrees: [
      { libelle: 'Offres internes', vers: null, lot: 'lot 4' },
      { libelle: 'Offres externes', vers: null, lot: 'lot 4' },
      { libelle: 'Offres web', vers: null, lot: 'lot 4' },
      { libelle: 'Entreprises', vers: null, lot: 'lot 4' },
    ],
  },
  {
    nom: 'Réseau',
    entrees: [
      { libelle: 'Référents', vers: '/espace/referents' },
      { libelle: 'Correspondants', vers: null, lot: 'lot 5' },
      { libelle: 'Réunion', vers: null, lot: 'lot 5' },
    ],
  },
  {
    nom: 'Pilotage',
    entrees: [
      { libelle: 'Tableau de bord', vers: null, lot: 'lot 5' },
      { libelle: 'Bilan', vers: null, lot: 'lot 5' },
    ],
  },
  {
    // La seule famille réservée. Un référent ne doit pas même la voir : une
    // entrée grisée qu'on ne peut pas atteindre est une invitation à essayer.
    nom: 'Admin',
    rolesAutorises: ['admin'],
    entrees: [
      { libelle: 'Invitations', vers: '/espace/admin' },
      { libelle: 'Loges', vers: null, lot: 'lot 5' },
      { libelle: "Secteur d'activité", vers: null, lot: 'lot 5' },
    ],
  },
];

/**
 * Une entrée à part, en pied de colonne, et non dans une famille : les
 * réglages ne sont pas un sujet de travail parmi d'autres, ils sont ce qu'on
 * va chercher quand on cherche. D'où la roue crantée, et sa place en bas —
 * celle qu'elle occupe dans presque toutes les applications.
 *
 * Elle mène aux listes que l'application propose partout ailleurs — les titres
 * du collège d'abord, les loges et les secteurs ensuite. « Mon compte », qui
 * ne règle que son propre cas, reste sous la pastille de la barre du haut.
 */
export const PARAMETRES: Entree & { vers: string } = {
  libelle: 'Paramètres',
  vers: '/espace/parametres',
};

/** Les familles qu'un rôle a le droit de voir. */
export function famillesDuRole(role: Role): Famille[] {
  return FAMILLES.filter((f) => !f.rolesAutorises || f.rolesAutorises.includes(role));
}

/**
 * Vrai si l'adresse courante correspond à cette entrée. On compare le début du
 * chemin : la fiche d'un candidat garde « Candidats » en surbrillance.
 */
export function estCourante(entree: Entree, chemin: string): boolean {
  if (!entree.vers) return false;
  return chemin === entree.vers || chemin.startsWith(`${entree.vers}/`);
}
