'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ChampsDeLaFiche, { type ValeursDeLaFiche } from '@/components/ChampsDeLaFiche';

type Erreur = { champ: string | null; message: string };

/**
 * La fiche, dans l'espace du candidat : les champs de 0057, et le
 * consentement au premier enregistrement seulement. Elle se modifie autant de
 * fois qu'il le veut.
 */
export default function FormulaireMaFiche({
  initial,
  email,
  premierEnvoi,
}: {
  initial: ValeursDeLaFiche;
  email: string;
  premierEnvoi: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [enregistree, setEnregistree] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnregistree(false);
    setEnvoi(true);

    const corps: Record<string, string> = {};
    for (const [cle, valeur] of new FormData(evenement.currentTarget).entries()) {
      if (typeof valeur === 'string') corps[cle] = valeur;
    }

    try {
      const reponse = await fetch('/api/ma-fiche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const resultat = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur({ champ: resultat.champ ?? null, message: resultat.erreur ?? 'L’enregistrement a échoué.' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setEnregistree(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      router.refresh();
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="formulaire-public" onSubmit={soumettre} method="post" noValidate>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur.message}
        </p>
      )}
      {enregistree && (
        <p className="encart" role="status">
          Votre fiche est enregistrée. Vous pouvez la modifier quand vous le souhaitez.
        </p>
      )}

      <ChampsDeLaFiche
        initial={initial}
        champFautif={erreur?.champ ?? null}
        email={{ valeur: email, verrouillee: true }}
      />

      {premierEnvoi && (
        <label className="consentement" aria-invalid={erreur?.champ === 'consentement' || undefined}>
          <input type="checkbox" name="consentement" value="oui" required />
          <span>
            J’accepte que la commission conserve ces informations et mes documents pour m’accompagner
            dans ma recherche. Ils ne sont lus que par les membres de la commission, ne sont jamais
            publiés, et je peux demander leur suppression.
          </span>
        </label>
      )}

      <button type="submit" className="bouton bouton--marque bouton--pleine-largeur" disabled={envoi}>
        {envoi ? 'Enregistrement…' : 'Enregistrer ma fiche'}
      </button>
    </form>
  );
}
