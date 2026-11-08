'use client';

import { useState } from 'react';
import type { Collegue } from './PanneauFiche';

/**
 * Le menu « Référent » d'un candidat déjà accompagné : choisir un nom suffit,
 * il s'enregistre aussitôt — pas de bouton à presser en plus.
 *
 * Le formulaire reste un vrai formulaire, envoyé à la même route que sans
 * script (`/api/candidats/[id]/referent`). Le script ne fait que l'envoyer au
 * changement de choix. Tant qu'il n'est pas chargé, ou s'il ne l'est jamais,
 * le bouton d'origine reste là, dans un `<noscript>` : l'écran fonctionne dans
 * tous les cas, et personne ne voit les deux à la fois.
 */
export default function MenuDuReferent({
  action,
  collegues,
  referentActuel,
}: {
  /** La route qui reçoit le choix. */
  action: string;
  /** Les référents de la loge du candidat, déjà triés et mis sur une ligne. */
  collegues: Collegue[];
  /** Le référent en place, sur lequel le menu s'ouvre. */
  referentActuel: string;
}) {
  const [envoi, setEnvoi] = useState(false);

  return (
    <form className="prise-en-charge" method="post" action={action}>
      <label htmlFor="choix-referent">Référent</label>
      <select
        id="choix-referent"
        name="referent_id"
        defaultValue={referentActuel}
        // Le menu se fige pendant l'envoi : un second choix fait avant le
        // retour de la page partirait derrière le premier.
        disabled={envoi}
        aria-busy={envoi}
        onChange={(evenement) => {
          // L'envoi d'abord, le menu figé ensuite : un champ désactivé ne
          // part pas avec le formulaire. `requestSubmit` lit les valeurs
          // tout de suite, avant que le nouvel état ne soit rendu.
          evenement.currentTarget.form?.requestSubmit();
          setEnvoi(true);
        }}
      >
        {collegues.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="bouton">
          Changer de référent
        </button>
      </noscript>
    </form>
  );
}
