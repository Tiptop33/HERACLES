import { redirect } from 'next/navigation';
import { RUBRIQUES } from '@/lib/parametres';

/**
 * Les paramètres s'ouvrent sur leur première rubrique.
 *
 * Un volet de droite vide n'apprend rien : l'écran s'ouvre là où il y a
 * quelque chose à régler.
 */
export default function Parametres() {
  const premiere = RUBRIQUES.find((r) => r.vers);
  redirect(premiere?.vers ?? '/espace/accueil');
}
