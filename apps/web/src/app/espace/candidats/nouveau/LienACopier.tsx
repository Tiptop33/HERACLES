'use client';

import { useState } from 'react';

/**
 * Un lien à transmettre soi-même, quand le courriel n'a pas pu partir.
 *
 * Il n'existe qu'ici, le temps de l'écran : la base n'en garde que
 * l'empreinte. On le dit, pour qu'il ne se perde pas.
 */
export default function LienACopier({ lien, consigne }: { lien: string; consigne: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le champ
      // reste sélectionnable à la main.
      setCopie(false);
    }
  }

  return (
    <div className="encart lien-a-copier" role="status">
      <p>{consigne}</p>
      <div className="lien-a-copier-ligne">
        <input
          type="text"
          readOnly
          value={lien}
          aria-label="Lien à transmettre"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="bouton" onClick={copier}>
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="aide">Ce lien ne s’affichera plus : HERACLES n’en garde qu’une empreinte.</p>
    </div>
  );
}
