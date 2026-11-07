'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import LienACopier from './LienACopier';

/**
 * Inviter un parrain : une adresse, un bouton.
 *
 * `method="post"` et `action` : un envoi parti avant l'hydratation arrive
 * quand même à la route, au lieu de recopier l'adresse dans l'URL. Avec le
 * script, la réponse s'affiche sur place — et si le courriel n'est pas parti,
 * le lien est montré pour être transmis à la main.
 */
export default function InviterParrain() {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoye(null);
    setLien(null);
    setEnvoi(true);

    const formulaire = evenement.currentTarget;
    const email = String(new FormData(formulaire).get('email') ?? '');

    try {
      const reponse = await fetch('/api/parrainages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const resultat = await reponse.json();

      if (!reponse.ok) {
        setErreur(resultat.erreur ?? 'L’invitation n’a pas pu être créée.');
        return;
      }

      if (resultat.envoye) setEnvoye(email);
      else setLien(resultat.lien ?? null);

      formulaire.reset();
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} method="post" action="/api/parrainages" noValidate>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      {envoye && (
        <p className="encart" role="status">
          Le lien est parti chez <strong>{envoye}</strong>.
        </p>
      )}

      {lien && (
        <LienACopier
          lien={lien}
          consigne="Le courriel n’est pas parti. L’invitation est enregistrée : transmettez ce lien au parrain."
        />
      )}

      <div className="ligne-edition">
        <div className="champ">
          <label htmlFor="parrain-email">Adresse e-mail du parrain</label>
          <input id="parrain-email" name="email" type="email" autoComplete="off" required />
        </div>
      </div>

      <button type="submit" className="bouton bouton--marque" disabled={envoi}>
        {envoi ? 'Envoi…' : 'Envoyer le lien au parrain'}
      </button>
    </form>
  );
}
