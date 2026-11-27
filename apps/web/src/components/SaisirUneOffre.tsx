'use client';

import { useRef, useState } from 'react';
import FenetreDeSaisieDOffre from './FenetreDeSaisieDOffre';

/**
 * « + Saisir une offre », en tête de la liste des offres en cours, et la
 * fenêtre qu'il ouvre (27 novembre 2026, à la demande). Référents et
 * administration : l'écran n'est ouvert qu'à eux, et la base refuse les
 * autres.
 *
 * Toucher le bouton quand la fenêtre est ouverte n'en ouvre pas une seconde.
 */
export default function SaisirUneOffre() {
  const [ouverte, setOuverte] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className="bouton bouton--petit"
        data-aide="saisir-une-offre"
        aria-expanded={ouverte}
        onClick={() => setOuverte(true)}
      >
        + Saisir une offre
      </button>
      {ouverte && (
        <FenetreDeSaisieDOffre
          fermer={() => {
            setOuverte(false);
            bouton.current?.focus();
          }}
        />
      )}
    </>
  );
}
