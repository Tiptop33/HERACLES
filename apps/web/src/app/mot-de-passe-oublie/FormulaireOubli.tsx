'use client';

import { useState } from 'react';

export default function FormulaireOubli({ erreurInitiale }: { erreurInitiale?: boolean }) {
  const [erreur, setErreur] = useState<string | null>(
    erreurInitiale ? "L'adresse e-mail n'est pas valide." : null,
  );
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

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

  if (envoye) {
    return (
      <p className="discret">
        Si cette adresse correspond à un compte, un lien de réinitialisation vient de partir.
      </p>
    );
  }

  return (
    <form onSubmit={soumettre} action="/api/mot-de-passe-oublie" method="post" noValidate>
      <label className={`champ${erreur ? ' champ--faux' : ''}`}>
        <span>Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required />
        {erreur && <span className="erreur-champ">{erreur}</span>}
      </label>

      <button
        className="bouton bouton--marque bouton--pleine-largeur"
        type="submit"
        disabled={envoi}
      >
        {envoi ? 'Envoi…' : 'Envoyer le lien'}
      </button>
    </form>
  );
}
