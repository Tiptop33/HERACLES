/** Le libellé d'un rôle, tel que l'écran d'invitation l'annonce. */
export function libelleRoleInvitation(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrateur';
    case 'chercheur':
      return 'Candidat';
    default:
      return 'Référent';
  }
}
