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
      // « Action / Candidat » a été retiré le 8 août 2026 : d'abord du menu,
      // puis pour de bon — l'écran, sa route, et la fonction
      // `suivi_de_la_loge()` qui le servait (migration 0035). Le suivi se lit
      // et s'écrit désormais dans la fiche du candidat, et c'est la seule porte.
      { libelle: 'Relation', vers: null, lot: 'lot 4' },
      { libelle: 'Messagerie', vers: null, lot: 'lot 5' },
    ],
  },
  {
    nom: 'Emploi',
    entrees: [
      // En service le 27 novembre 2026 : les offres que référents et
      // administration saisissent à la main (migrations 0114, 0115).
      { libelle: 'Offres internes', vers: '/espace/offres-internes' },
      // Les offres de France Travail : « Offres externes » jusqu'au 23 novembre
      // 2026, renommée à la demande. Renommée « Offres externes » le 27 par une
      // autre session sans que personne l'ait demandé, rétablie le jour même.
      // À la même place, et à la même adresse.
      { libelle: 'France Travail', vers: '/espace/france-travail' },
      { libelle: 'Offres web', vers: null, lot: 'lot 4' },
      { libelle: 'Entreprises', vers: null, lot: 'lot 4' },
    ],
  },
  {
    // « Réseau » jusqu'au 27 novembre 2026, renommée à la demande. Même
    // place dans la colonne, mêmes adresses.
    nom: 'Membres Héraclés',
    entrees: [
      { libelle: 'Référents', vers: '/espace/referents' },
      { libelle: 'Correspondants', vers: null, lot: 'lot 5' },
      // « Réunion » était ici jusqu'au 27 novembre 2026 : elle est passée
      // dans la famille Admin, réservée à l'administration (migration 0117).
      // Ajoutée le 10 novembre 2026, à la demande : une carte par province,
      // son image puis son nom (migration 0080). En fin de famille, pour ne
      // déplacer aucune des entrées que les référents connaissent déjà.
      // Visible de tous : c'est un référentiel, il ne dit rien de personne.
      { libelle: 'Province', vers: '/espace/provinces' },
      // Ajoutée le 11 novembre 2026, à la demande : les comptes rendus,
      // affiches et affichettes de l'exercice, sur un écran à eux. L'écran est
      // né pour l'onglet « Documents » du téléphone ; il lui fallait une porte
      // sur ordinateur aussi. En fin de famille, après « Province », pour ne
      // déplacer aucune entrée. Visible de tous : la base ne rend à chacun que
      // les PDF de sa loge.
      { libelle: 'Documents', vers: '/espace/documents' },
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
      // Venue de la famille Réseau le 27 novembre 2026, à la demande : l'appel,
      // le registre, le compte rendu, l'affiche et l'affichette ne se tiennent
      // plus que par l'administration (migration 0117). En tête de famille,
      // à la demande du même jour : c'est l'écran que l'administration ouvre
      // à chaque séance. L'adresse ne change pas : les liens déjà donnés
      // restent valables.
      { libelle: 'Réunion', vers: '/espace/reunion' },
      { libelle: 'Invitations', vers: '/espace/admin' },
      // Ouvrir un dossier depuis l'administration : le même écran que le
      // bouton du volet des candidats (invitation du parrain).
      { libelle: 'Nouveau candidat', vers: '/espace/candidats/nouveau' },
      { libelle: 'Loges', vers: null, lot: 'lot 5' },
      { libelle: "Secteur d'activité", vers: null, lot: 'lot 5' },
      // Ajoutée le 26 novembre 2026, à la demande : le rôle et la loge de tout
      // compte, y compris ceux qui ne sont pas entrés par une invitation
      // (migration 0109). En fin de famille, pour ne déplacer aucune entrée.
      { libelle: 'Comptes', vers: '/espace/admin/comptes' },
      // Ajoutée le 26 novembre 2026, à la demande : le journal des connexions
      // des référents — date, heure, durée (migration 0110). En fin de
      // famille, après « Comptes », pour ne déplacer aucune entrée.
      { libelle: 'Connexions', vers: '/espace/admin/connexions' },
      // Venue de la famille Réseau le 27 novembre 2026, à la demande : l'appel,
      // le registre, le compte rendu, l'affiche et l'affichette ne se tiennent
      // plus que par l'administration (migration 0117). En fin de famille,
      // pour ne déplacer aucune entrée d'Admin. L'adresse ne change pas : les
      // liens déjà donnés restent valables.
      { libelle: 'Réunion', vers: '/espace/reunion' },
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
 *
 * `voisines` : les autres entrées affichées. Quand l'une d'elles correspond
 * plus précisément (« Nouveau candidat » sous « Candidats »), c'est elle seule
 * qui s'allume — deux entrées en surbrillance ne disent plus où l'on est.
 */
export function estCourante(
  entree: Entree,
  chemin: string,
  voisines: readonly Entree[] = [],
): boolean {
  if (!correspond(entree.vers, chemin)) return false;
  const longueur = entree.vers!.length;
  return !voisines.some(
    (v) => v !== entree && v.vers && v.vers.length > longueur && correspond(v.vers, chemin),
  );
}

function correspond(vers: string | null, chemin: string): boolean {
  if (!vers) return false;
  return chemin === vers || chemin.startsWith(`${vers}/`);
}

/** L'entrée « Invitations » de la famille Admin. */
const INVITATIONS = '/espace/admin';

/** La fiche d'un référent : `/espace/referents/<uuid>` et ce qui suit. */
const FICHE_REFERENT =
  /^\/espace\/referents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/**
 * L'adresse où mène une entrée, depuis l'écran où l'on est.
 *
 * Une seule dépend de l'écran : « Invitations », touchée depuis la fiche d'un
 * référent, emporte l'identifiant de cette fiche — le formulaire s'ouvre alors
 * sur son adresse e-mail (demande du 26 novembre 2026). L'identifiant, et non
 * l'adresse : une adresse e-mail n'a rien à faire dans une barre d'adresse ni
 * dans un journal de serveur, et la page la relit sous RLS.
 */
export function adresseDeLEntree(vers: string, chemin: string): string {
  if (vers !== INVITATIONS) return vers;
  const fiche = FICHE_REFERENT.exec(chemin);
  return fiche ? adresseDInvitation(fiche[1].toLowerCase()) : vers;
}

/**
 * Le formulaire d'invitation, ouvert sur un référent : son adresse e-mail et
 * sa loge y sont proposées. C'est aussi où mène l'enveloppe de sa carte.
 */
export function adresseDInvitation(referentId: string): string {
  return `${INVITATIONS}?referent=${referentId}`;
}
