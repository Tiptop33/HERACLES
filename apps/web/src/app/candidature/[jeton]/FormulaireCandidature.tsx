'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ChampsDeLaFiche from '@/components/ChampsDeLaFiche';

/**
 * La fiche que le candidat remplit lui-même — `renseignement_candidat` chez
 * Bubble, d'une seule page plutôt qu'en quatre étapes : on la relit d'un coup
 * d'œil avant d'envoyer, et rien ne se perd en revenant en arrière.
 *
 * `multipart/form-data`, avec ou sans script : le CV part avec le reste. Avec
 * le script, la réponse s'affiche sur place et rien de ce qui a été tapé ne se
 * perd en cas d'erreur.
 */

type Erreur = { champ: string | null; message: string };

const ACCEPTES =
  '.pdf,.doc,.docx,.odt,.rtf,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,image/jpeg,image/png,image/webp';

export default function FormulaireCandidature({
  jeton,
  initial,
}: {
  jeton: string;
  initial: { prenom: string; nom: string; email: string; type_emploi: string };
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch(`/api/candidature/${jeton}`, {
        method: 'POST',
        // Le corps est un FormData : le navigateur pose lui-même l'en-tête
        // multipart et sa frontière. Celui-ci dit seulement à la route de
        // répondre en JSON plutôt que par une redirection.
        headers: { 'x-requested-with': 'fetch' },
        body: new FormData(evenement.currentTarget),
      });
      const resultat = await reponse.json();

      if (!reponse.ok) {
        setErreur({ champ: resultat.champ ?? null, message: resultat.erreur ?? 'L’envoi a échoué.' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      router.push('/merci?pour=candidat');
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  const champ = (nom: string) => ({
    id: `c-${nom}`,
    name: nom,
    'aria-invalid': erreur?.champ === nom ? true : undefined,
  });

  return (
    <form
      className="formulaire-public"
      onSubmit={soumettre}
      method="post"
      action={`/api/candidature/${jeton}`}
      encType="multipart/form-data"
      noValidate
    >
      {erreur && (
        <p className="erreur" role="alert">
          {erreur.message}
        </p>
      )}

      <ChampsDeLaFiche
        initial={{ prenom: initial.prenom, nom: initial.nom, type_emploi: initial.type_emploi }}
        champFautif={erreur?.champ ?? null}
        email={{ valeur: initial.email, verrouillee: false }}
      />

      <fieldset>
        <legend>Vos documents</legend>
        <div className="champ">
          <label htmlFor="c-cv">CV *</label>
          <input {...champ('cv')} type="file" accept={ACCEPTES} required />
        </div>
        <div className="champ">
          <label htmlFor="c-lettre">Lettre de motivation</label>
          <input {...champ('lettre')} type="file" accept={ACCEPTES} />
        </div>
        <p className="aide">PDF, Word, OpenDocument, RTF ou photo (JPEG, PNG, WebP), 10 Mo au plus.</p>
      </fieldset>

      <label className="consentement" aria-invalid={erreur?.champ === 'consentement' || undefined}>
        <input type="checkbox" name="consentement" value="oui" required />
        <span>
          J’accepte que la commission conserve ces informations et mes documents pour m’accompagner
          dans ma recherche. Ils ne sont lus que par les membres de la commission de la loge, ne
          sont jamais publiés, et je peux demander leur suppression.
        </span>
      </label>

      <button type="submit" className="bouton bouton--marque bouton--pleine-largeur" disabled={envoi}>
        {envoi ? 'Envoi…' : 'Envoyer ma fiche'}
      </button>
    </form>
  );
}
