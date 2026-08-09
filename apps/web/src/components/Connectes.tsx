'use client';

import { useEffect, useState } from 'react';
import { initiales, nomAffichable } from '@/lib/format';
import type { Connecte } from '@/lib/presence';

/**
 * « Qui est là » — les référents de la loge dont la session est ouverte, sous
 * votre nom dans la colonne de gauche.
 *
 * Une photo par personne, et son nom au survol. La vignette est un `title`
 * doublé d'un `aria-label` : pas d'infobulle maison, celle du navigateur
 * s'affiche partout, y compris au clavier et sous lecteur d'écran.
 *
 * **Le seul endroit de l'application où un script est nécessaire.** La liste
 * vieillirait sans lui : une page rendue par le serveur ne bouge plus une fois
 * affichée, et l'on peut rester une heure sur la même. Le rafraîchissement ne
 * touche que cette liste — le reste de l'écran ne bronche pas, et une saisie
 * en cours ne se perd pas.
 *
 * Sans JavaScript, la liste rendue par le serveur reste affichée telle quelle.
 * Elle ne se met plus à jour, mais elle est là : c'est un ornement qui se
 * dégrade, pas une fonction qui disparaît.
 */

/** Trente secondes : assez pour suivre, assez peu pour ne pas peser. */
const CADENCE = 30_000;

export default function Connectes({ initiaux }: { initiaux: Connecte[] }) {
  const [connectes, setConnectes] = useState(initiaux);

  useEffect(() => {
    let vivant = true;

    const relire = async () => {
      // Un onglet en arrière-plan n'a personne devant lui : inutile de
      // réveiller le serveur toutes les trente secondes pour rien.
      if (document.visibilityState !== 'visible') return;

      try {
        const reponse = await fetch('/api/connectes', { cache: 'no-store' });
        if (!reponse.ok) return;
        const lu = (await reponse.json()) as { connectes?: Connecte[] };
        if (vivant && Array.isArray(lu.connectes)) setConnectes(lu.connectes);
      } catch {
        // Le réseau a hoqueté : on garde la liste précédente et on réessaiera
        // dans trente secondes. Une colonne qui se vide au premier hoquet
        // ferait croire que tout le monde est parti.
      }
    };

    const minuteur = setInterval(relire, CADENCE);
    document.addEventListener('visibilitychange', relire);

    return () => {
      vivant = false;
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', relire);
    };
  }, []);

  if (connectes.length === 0) return null;

  return (
    <div className="colonne-connectes">
      <p className="colonne-connectes-titre">
        {connectes.length === 1 ? 'Aussi en ligne' : `Aussi en ligne — ${connectes.length}`}
      </p>

      <ul className="connectes-visages">
        {connectes.map((c) => {
          const nom = nomAffichable(c.prenom, c.nom, null) ?? 'Référent sans nom';
          return (
            <li key={c.referent_id}>
              {c.a_une_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/espace/referents/${c.referent_id}/photo`}
                  alt={nom}
                  title={nom}
                  width={30}
                  height={30}
                />
              ) : (
                <span className="connecte-initiales" title={nom} aria-label={nom} role="img">
                  {initiales(c.prenom, c.nom)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
