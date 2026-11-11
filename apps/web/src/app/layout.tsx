import type { Metadata, Viewport } from 'next';
import { cheminIconeApple, cheminLogo } from '@/lib/logo';
import './globals.css';

export const metadata: Metadata = {
  title: 'HERACLES',
  description:
    "Trouver un référent qui vous accompagne dans votre recherche d'emploi, d'alternance ou de stage.",
  // Le même fichier sert d'icône d'onglet. Déclarée seulement s'il est là :
  // annoncer une icône absente ferait demander au navigateur une image qui
  // n'existe pas, et il en garderait l'échec en mémoire.
  // `apple` : l'icône que l'iPhone et l'iPad posent sur l'écran d'accueil.
  ...(cheminLogo ? { icons: { icon: cheminLogo, apple: cheminIconeApple ?? cheminLogo } } : {}),
  // Ouverte depuis l'écran d'accueil, l'application prend tout l'écran — voir
  // `manifest.ts`, que les anciens iPhone ne lisent pas pour ce réglage.
  appleWebApp: { capable: true, title: 'HERACLES' },
};

/**
 * `viewportFit: 'cover'` : la page s'étend jusqu'aux bords de l'iPhone, et la
 * barre d'onglets du bas se réserve elle-même la place de la barre d'accueil
 * (`env(safe-area-inset-bottom)`). Sans lui, cette valeur reste à zéro et la
 * barre se retrouverait sous le trait du bas de l'écran.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
