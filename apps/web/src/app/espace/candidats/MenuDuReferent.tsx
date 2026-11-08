'use client';

import { useState } from 'react';
import type { Collegue } from './PanneauFiche';

/**
 * Le menu « Référent » d'un candidat déjà accompagné, à la place du nom sur
 * la ligne « Référent » du bloc Accompagnement : choisir un nom suffit, il
 * s'enregistre aussitôt — pas de bouton à presser en plus.
 *
 * Le formulaire reste un vrai formulaire, envoyé à la même route que sans
 * script (`/api/candidats/[id]/referent`). Le script ne fait que l'envoyer au
 * changement de choix. Tant qu'il n'est pas chargé, ou s'il ne l'est jamais,
 * le bouton d'origine reste là, dans un `<noscript>` : l'écran fonctionne dans
 * tous les cas, et personne ne voit les deux à la fois.
 *
 * Il n'a pas de libellé à lui : l'intitulé « Référent » de la ligne le nomme,
 * par `aria-labelledby`.
 */
export default function MenuDuReferent({
  action,
  collegues,
  referentActuel,
  intitule,
}: {
  /** La route qui reçoit le choix. */
  action: string;
  /** Les référents de la loge du candidat, déjà triés et mis sur une ligne. */
  collegues: Collegue[];
  /** Le référent en place, sur lequel le menu s'ouvre. */
  referentActuel: string;
  /** L'identifiant de l'intitulé qui nomme le menu. */
  intitule: string;
}) {
  const [envoi, setEnvoi] = useState(false);

  return (
    <form className="referent-en-ligne" method="post" action={action}>
      <select
        name="referent_id"
        aria-labelledby={intitule}
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
        <button type="submit" className="bouton bouton--petit">
          Changer
        </button>
      </noscript>
    </form>
  );
}
