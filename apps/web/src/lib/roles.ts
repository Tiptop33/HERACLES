/**
 * Les rôles du produit. « chercheur » est la personne accompagnée, « referent »
 * celle qui accompagne, « admin » l'exploitant du service.
 * Ces valeurs doivent rester alignées sur le type SQL `role_utilisateur`.
 */
export const ROLES = ['chercheur', 'referent', 'admin'] as const;

export type Role = (typeof ROLES)[number];

/** Les deux seuls rôles qu'on peut choisir en s'inscrivant. */
export const ROLES_INSCRIPTION = ['chercheur', 'referent'] as const;

export type RoleInscription = (typeof ROLES_INSCRIPTION)[number];

/** Vrai si la valeur reçue est un rôle choisissable à l'inscription. */
export function estRoleInscription(valeur: unknown): valeur is RoleInscription {
  return typeof valeur === 'string' && (ROLES_INSCRIPTION as readonly string[]).includes(valeur);
}

/**
 * Où atterrit un utilisateur une fois connecté. Un rôle inconnu ou absent
 * renvoie vers l'espace chercheur : c'est le cas par défaut du produit, et il
 * ne donne accès à aucune donnée d'autrui.
 */
export function accueilDuRole(role: string | null | undefined): string {
  switch (role) {
    case 'referent':
      return '/espace/referent';
    case 'admin':
      return '/espace/admin';
    default:
      return '/espace/chercheur';
  }
}

/** Libellé affichable d'un rôle. */
export function libelleDuRole(role: string | null | undefined): string {
  switch (role) {
    case 'referent':
      return 'Référent';
    case 'admin':
      return 'Administrateur';
    default:
      return 'Chercheur';
  }
}
