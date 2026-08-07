'use client';

import { useState } from 'react';

export default function FormulaireOubli({
  erreurInitiale,
  dejaEnvoye,
}: {
  erreurInitiale?: boolean;
  dejaEnvoye?: boolean;
}) {
  const [erreur, setErreur] = useState<string | null>(
    erreurInitiale ? "L'adresse e-mail n'est pas valide." : null,
  );
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(Boolean(dejaEnvoye));

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);

    try {
      const reponse = await fetch('/api/mot-de-passe-oublie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(champs.get('email') ?? '') }),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? "L'envoi a échoué.");
        return;
      }

      setEnvoye(true);
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} action="/api/mot-de-passe-oublie" method="post" noValidate>
      <label className={`champ${erreur ? ' champ--faux' : ''}`}>
        <span className="visuellement-cache">Adresse e-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Adresse e-mail"
          required
        />
        {erreur && <span className="erreur-champ">{erreur}</span>}
      </label>

      <button
        className="bouton bouton--marque bouton--pleine-largeur"
        type="submit"
        disabled={envoi}
      >
        {envoi ? 'Envoi…' : 'Envoyer le lien'}
      </button>

      {envoye && (
        // Toujours la même phrase, que l'adresse soit inscrite ou non : dire
        // « adresse inconnue » ferait de ce formulaire l'annuaire des comptes.
        <p className="encart" role="status">
          Si un compte existe pour cette adresse, un e-mail vient de partir.
        </p>
      )}
    </form>
  );
}
