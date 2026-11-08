'use client';

/**
 * Un bouton « Nouveau candidat » : il ouvre la fenêtre flottante
 * (`FenetreNouveauCandidat`, montée une fois dans la coquille des espaces).
 *
 * C'est un vrai lien vers `/espace/candidats/nouveau` : sans script, ou ouvert
 * dans un autre onglet (Cmd/Ctrl-clic, clic du milieu), il mène à la page,
 * qui fait la même chose et montre en plus le suivi des invitations.
 */

export const EVENEMENT_NOUVEAU_CANDIDAT = 'heracles:nouveau-candidat';
export const ADRESSE_NOUVEAU_CANDIDAT = '/espace/candidats/nouveau';

export default function OuvrirNouveauCandidat({
  className,
  children,
  ...reste
}: {
  className?: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  function ouvrir(e: React.MouseEvent<HTMLAnchorElement>) {
    // Laisser au navigateur ce qui ouvre ailleurs : nouvel onglet, fenêtre.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.dispatchEvent(new Event(EVENEMENT_NOUVEAU_CANDIDAT));
  }

  return (
    <a {...reste} href={ADRESSE_NOUVEAU_CANDIDAT} className={className} onClick={ouvrir}>
      {children}
    </a>
  );
}
