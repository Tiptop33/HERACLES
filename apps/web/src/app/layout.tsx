import type { Metadata } from 'next';
import { cheminLogo } from '@/lib/logo';
import './globals.css';

export const metadata: Metadata = {
  title: 'HERACLES',
  description:
    "Trouver un référent qui vous accompagne dans votre recherche d'emploi, d'alternance ou de stage.",
  // Le même fichier sert d'icône d'onglet. Déclarée seulement s'il est là :
  // annoncer une icône absente ferait demander au navigateur une image qui
  // n'existe pas, et il en garderait l'échec en mémoire.
  // `apple` : l'icône que l'iPhone et l'iPad posent sur l'écran d'accueil.
  ...(cheminLogo ? { icons: { icon: cheminLogo, apple: cheminLogo } } : {}),
  // Ouverte depuis l'écran d'accueil, l'application prend tout l'écran — voir
  // `manifest.ts`, que les anciens iPhone ne lisent pas pour ce réglage.
  appleWebApp: { capable: true, title: 'HERACLES' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
