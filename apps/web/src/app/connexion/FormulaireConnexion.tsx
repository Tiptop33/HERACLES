'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function FormulaireConnexion({ suite }: { suite?: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);

    try {
      const reponse = await fetch('/api/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(champs.get('email') ?? ''),
          motDePasse: String(champs.get('motDePasse') ?? ''),
        }),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? 'La connexion a échoué.');
        return;
      }

      // Une page demandée avant la connexion l'emporte sur l'accueil du rôle,
      // à condition qu'elle soit interne au site.
      const destination =
        suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : resultat.redirection;

      router.push(destination);
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      {erreur && <p className="erreur">{erreur}</p>}

      <label className="champ">
        <span>Adresse email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>

      <label className="champ">
        <span>Mot de passe</span>
        <input name="motDePasse" type="password" autoComplete="current-password" required />
      </label>

      <button className="bouton bouton--fort" type="submit" disabled={envoi}>
        {envoi ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
