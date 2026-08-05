'use client';

/**
 * Imprimer la fiche. Le seul morceau de l'espace référent qui a besoin du
 * navigateur — la mise en page d'impression, elle, vit dans `globals.css`.
 */
export default function BoutonImprimer() {
  return (
    <button type="button" className="bouton" onClick={() => window.print()}>
      Imprimer
    </button>
  );
}
