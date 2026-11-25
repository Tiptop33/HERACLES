import { NextResponse } from 'next/server';
import { lireCorps, origine } from '@/lib/formulaire';
import { ouvrirLaSession } from '@/lib/page-candidat-serveur';
import { jeMeConnecte } from '@/lib/presence';

/**
 * Le bouton « Ouvrir mon espace » de la page d'arrivée du lien.
 *
 * Un POST et non le clic sur le lien lui-même : les messageries d'entreprise
 * ouvrent les liens d'un courriel pour les vérifier, et un jeton qui ne sert
 * qu'une fois serait alors consommé avant que la personne ne le touche.
 */
export async function POST(requete: Request) {
  const racine = origine(requete);
  const corps = await lireCorps(requete);
  const jeton = typeof corps?.jeton === 'string' ? corps.jeton : '';

  if (!(await ouvrirLaSession(jeton))) {
    return NextResponse.redirect(new URL('/connexion/lien?erreur=lien', racine), 303);
  }

  // Comme `/auth/callback` : avant la redirection, rien ne s'exécute après.
  await jeMeConnecte();
  return NextResponse.redirect(new URL('/espace/chercheur', racine), 303);
}
