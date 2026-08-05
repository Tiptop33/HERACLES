'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Profil } from '@/lib/profil';

export default function FormulaireProfil({ profil }: { profil: Profil }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnregistre(false);
    setEnvoi(true);

    const champs = new FormData(evenement.currentTarget);
    const corps = Object.fromEntries(
      ['nom', 'prenom', 'telephone', 'ville', 'code_postal', 'presentation'].map((cle) => [
        cle,
        String(champs.get(cle) ?? ''),
      ]),
    );

    try {
      const reponse = await fetch('/api/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });

      const resultat = await reponse.json();
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? "L'enregistrement a échoué.");
        return;
      }

      setEnregistre(true);
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    // `method="post"` sans `action` : la route d'enregistrement est en PATCH,
    // qu'un formulaire natif ne sait pas émettre. Ce qui compte ici est qu'un
    // envoi parti avant l'hydratation ne recopie pas nom, téléphone et ville
    // dans l'adresse — le corps d'un POST, lui, ne s'écrit ni dans
    // l'historique ni dans les journaux.
    <form onSubmit={soumettre} method="post">
      {erreur && <p className="erreur">{erreur}</p>}
      {enregistre && <p className="discret">Enregistré.</p>}

      <label className="champ">
        <span>Prénom</span>
        <input name="prenom" defaultValue={profil.prenom ?? ''} autoComplete="given-name" />
      </label>

      <label className="champ">
        <span>Nom</span>
        <input name="nom" defaultValue={profil.nom ?? ''} autoComplete="family-name" />
      </label>

      <label className="champ">
        <span>Téléphone</span>
        <input name="telephone" defaultValue={profil.telephone ?? ''} autoComplete="tel" />
      </label>

      <label className="champ">
        <span>Ville</span>
        <input name="ville" defaultValue={profil.ville ?? ''} autoComplete="address-level2" />
      </label>

      <label className="champ">
        <span>Code postal</span>
        <input
          name="code_postal"
          defaultValue={profil.code_postal ?? ''}
          autoComplete="postal-code"
          inputMode="numeric"
        />
      </label>

      <label className="champ">
        <span>Présentation</span>
        <textarea name="presentation" rows={5} defaultValue={profil.presentation ?? ''} />
        <span className="discret">Quelques lignes sur votre parcours ou votre recherche.</span>
      </label>

      <button className="bouton bouton--fort" type="submit" disabled={envoi}>
        {envoi ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
