'use client';

import { useRef } from 'react';

/**
 * Le dossier de l'affichette, choisi en séance.
 *
 * Le choix s'enregistre dès qu'on le fait : pas de bouton « Valider » à
 * chercher pendant que la réunion continue. Sans JavaScript, le formulaire
 * garde un bouton pour envoyer — l'écran « Réunion » doit fonctionner partout.
 */
export default function ChoixDeLAffichette({
  reunion,
  choisi,
  options,
}: {
  reunion: string;
  choisi: string | null;
  options: Array<{ valeur: string; libelle: string }>;
}) {
  const formulaire = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formulaire}
      method="post"
      action={`/api/reunions/${reunion}/affichette`}
      className="appel-affichette"
    >
      <input type="hidden" name="retour" value={`/espace/reunion?appel=${reunion}`} />
      <label htmlFor="affichette-dossier">Dossier de l’affichette</label>
      <select
        id="affichette-dossier"
        name="candidat"
        defaultValue={choisi ?? ''}
        onChange={() => formulaire.current?.requestSubmit()}
      >
        <option value="">— aucun pour l’instant —</option>
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      <noscript>
        <button className="bouton" type="submit">
          Retenir
        </button>
      </noscript>
    </form>
  );
}
