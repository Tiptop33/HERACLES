'use client';

import { useId, useState } from 'react';
import { Oeil, OeilBarre } from '@/components/Icones';

/**
 * Un champ de mot de passe, et l'œil qui le rend lisible.
 *
 * Un mot de passe se tape à l'aveugle : sur un clavier de téléphone, une
 * majuscule ou un accent se glisse sans qu'on le voie, et l'écran suivant dit
 * seulement « incorrect ». L'œil lève ce doute avant l'envoi, plutôt qu'après.
 *
 * Il ne dévoile rien de plus que ce qui est déjà sous les yeux de la personne
 * qui tape : le champ repart masqué à chaque page, et un second appui le
 * remasque. Rien n'est envoyé, rien n'est retenu.
 *
 * Le champ marche dans les deux régimes : contrôlé si `valeur` est fournie —
 * la jauge de force en a besoin —, libre sinon, le formulaire lisant alors le
 * champ à l'envoi.
 */
export default function ChampMotDePasse({
  nom,
  libelle,
  libelleCache = false,
  placeholder,
  autoComplete,
  valeur,
  surSaisie,
  erreur,
}: {
  nom: string;
  libelle: string;
  /** Cacher le libellé à l'œil, jamais aux lecteurs d'écran : les écrans
      d'entrée de la maquette ne portent qu'un texte d'invite. */
  libelleCache?: boolean;
  placeholder?: string;
  autoComplete: string;
  valeur?: string;
  surSaisie?: (valeur: string) => void;
  erreur?: string | null;
}) {
  const identifiant = useId();
  const [visible, setVisible] = useState(false);

  const geste = visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe';

  return (
    <div className={`champ${erreur ? ' champ--faux' : ''}`}>
      <label className={libelleCache ? 'visuellement-cache' : undefined} htmlFor={identifiant}>
        {libelle}
      </label>

      <div className="champ-oeil">
        <input
          id={identifiant}
          name={nom}
          // Montrer le mot de passe, c'est changer le type du champ : rien
          // d'autre ne transforme les points en lettres.
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={valeur}
          onChange={surSaisie ? (evenement) => surSaisie(evenement.target.value) : undefined}
          required
        />

        {/* `type="button"` : sans lui, un bouton dans un formulaire l'envoie —
            l'œil enverrait la connexion à chaque appui. */}
        <button
          type="button"
          className="oeil"
          onClick={() => setVisible((affiche) => !affiche)}
          aria-label={geste}
          aria-controls={identifiant}
          title={geste}
        >
          {visible ? <OeilBarre /> : <Oeil />}
        </button>
      </div>

      {erreur && <span className="erreur-champ">{erreur}</span>}
    </div>
  );
}
