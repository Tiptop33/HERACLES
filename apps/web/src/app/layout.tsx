import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HERACLES',
  description:
    "Trouver un référent qui vous accompagne dans votre recherche d'emploi, d'alternance ou de stage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
