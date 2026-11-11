import type { MetadataRoute } from 'next';
import { cheminLogo } from '@/lib/logo';

/**
 * Ce qui permet de poser HERACLES sur l'écran d'accueil d'un téléphone :
 * « Ajouter à l'écran d'accueil », et l'application s'ouvre avec son icône,
 * sans la barre du navigateur.
 *
 * Rien de plus : ni mode hors ligne, ni notifications. Aucune fiche n'est
 * gardée sur le téléphone — la session et la RLS restent ce qu'elles sont, et
 * un téléphone perdu ne contient rien.
 *
 * L'adresse de départ est l'accueil des espaces : sans session, le proxy
 * renvoie à la connexion, puis y ramène.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HERACLES',
    short_name: 'HERACLES',
    description: "L'accompagnement des candidats vers l'emploi, l'alternance ou le stage.",
    lang: 'fr',
    start_url: '/espace/accueil',
    display: 'standalone',
    background_color: '#f2f4f7',
    theme_color: '#ffffff',
    // Le même fichier que partout ailleurs, et seulement s'il a été déposé.
    icons: cheminLogo?.endsWith('.png')
      ? [{ src: cheminLogo, sizes: '320x320', type: 'image/png', purpose: 'any' }]
      : [],
  };
}
