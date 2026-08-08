import { redirect } from 'next/navigation';
import { profilCourant } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

/**
 * La racine n'affiche rien : elle envoie ailleurs, tout de suite.
 *
 * Personne n'arrive ici pour lire une page de présentation — on vient
 * travailler. La porte s'ouvre donc directement sur la connexion, plutôt que
 * sur un écran d'accueil qu'il fallait traverser d'un clic.
 *
 * Sauf pour qui est déjà connecté : celui-là repart vers son espace. Le lien
 * « HERACLES » de la barre du haut mène ici ; l'envoyer au formulaire de
 * connexion lui ferait croire qu'il vient d'être déconnecté.
 *
 * Ce qu'annonçait l'ancien accueil — on n'entre qu'invité — n'est pas perdu :
 * la connexion porte « Pas encore de compte ? En créer un », qui mène à la
 * page qui l'explique.
 */
export default async function Racine() {
  const profil = await profilCourant();
  redirect(profil ? accueilDuRole(profil.role) : '/connexion');
}
