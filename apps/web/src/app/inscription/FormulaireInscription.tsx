'use client';

import { useState } from 'react';
import type { RoleInscription } from '@/lib/roles';

export default function FormulaireInscription({
  roleInitial,
}: {
  roleInitial: RoleInscription;
}) {
  const [role, setRole] = useState<RoleInscription>(roleInitial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);

    try {
      const reponse = await fetch('/api/inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          email: String(champs.get('email') ?? ''),
          motDePasse: String(champs.get('motDePasse') ?? ''),
          nom: String(champs.get('nom') ?? ''),
          prenom: String(champs.get('prenom') ?? ''),
        }),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? "L'inscription n'a pas abouti.");
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
      <div>
        <h2>Vérifiez votre boîte mail</h2>
        <p className="discret">
          Un email de confirmation vient de partir. Ouvrez-le et cliquez sur le lien pour
          activer votre compte. Pensez à regarder dans les indésirables.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={soumettre}>
      {erreur && <p className="erreur">{erreur}</p>}

      <label className="champ">
        <span>Je viens pour</span>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleInscription)}
        >
          <option value="chercheur">chercher un emploi, une alternance ou un stage</option>
          <option value="referent">accompagner des personnes en recherche</option>
        </select>
      </label>

      <label className="champ">
        <span>Prénom</span>
        <input name="prenom" autoComplete="given-name" required />
      </label>

      <label className="champ">
        <span>Nom</span>
        <input name="nom" autoComplete="family-name" required />
      </label>

      <label className="champ">
        <span>Adresse email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>

      <label className="champ">
        <span>Mot de passe</span>
        <input
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="discret">8 caractères au minimum.</span>
      </label>

      <button className="bouton bouton--fort" type="submit" disabled={envoi}>
        {envoi ? 'Création…' : 'Créer mon compte'}
      </button>
    </form>
  );
}
