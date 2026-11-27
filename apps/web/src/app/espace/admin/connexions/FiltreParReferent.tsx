'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Props = {
  referents: { id: string; libelle: string }[];
  /** Le référent affiché, ou une chaîne vide pour tous. */
  choisi: string;
};

/**
 * Le menu « Référent » au-dessus du tableau des connexions.
 *
 * Le choix s'applique aussitôt, sans bouton : il change l'adresse
 * (`?referent=…`), et c'est le serveur qui relit le journal. Un filtre porté
 * par l'adresse se met en favori, se partage, et se défait avec « retour ».
 */
export default function FiltreParReferent({ referents, choisi }: Props) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  function choisir(id: string) {
    const adresse = id
      ? `/espace/admin/connexions?referent=${encodeURIComponent(id)}`
      : '/espace/admin/connexions';
    demarrer(() => router.replace(adresse, { scroll: false }));
  }

  return (
    <label className="champ" style={{ maxWidth: '22rem' }} data-aide="filtre-connexions">
      <span>Référent</span>
      <select
        value={choisi}
        onChange={(evenement) => choisir(evenement.target.value)}
        aria-busy={enCours}
      >
        <option value="">Tous les référents</option>
        {referents.map((referent) => (
          <option key={referent.id} value={referent.id}>
            {referent.libelle}
          </option>
        ))}
      </select>
    </label>
  );
}
