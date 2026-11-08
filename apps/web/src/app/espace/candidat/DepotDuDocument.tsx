'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ACCEPTES_LETTRE =
  '.pdf,.doc,.docx,.odt,.rtf,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,image/jpeg,image/png,image/webp';

/**
 * Déposer son CV, ou sa lettre. Un envoi par document, à part de la fiche :
 * le fichier est enregistré dès qu'il est choisi et validé, et la page se
 * relit — rien à perdre si la fiche n'est pas encore finie.
 */
export default function DepotDuDocument({
  genre,
  present,
  principal = false,
}: {
  genre: 'cv' | 'lettre';
  present: boolean;
  /** Le premier écran : le CV est la seule chose demandée. */
  principal?: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const identifiant = `depot-${genre}`;

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    // Le formulaire se garde avant l'attente : passé `await`, React a déjà
    // vidé `currentTarget`.
    const formulaire = evenement.currentTarget;
    const champs = new FormData(formulaire);
    champs.set('genre', genre);

    try {
      const reponse = await fetch('/api/ma-fiche/document', { method: 'POST', body: champs });
      const resultat = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setErreur(resultat.erreur ?? 'Le dépôt a échoué.');
        return;
      }
      formulaire.reset();
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  const libelle = genre === 'cv' ? 'Votre CV (PDF)' : 'Lettre de motivation';

  return (
    <form onSubmit={soumettre} className="depot-document" noValidate>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      <div className="champ">
        <label htmlFor={identifiant}>
          {libelle}
          {present && <span className="depot-present"> · déposé</span>}
        </label>
        <input
          id={identifiant}
          name="fichier"
          type="file"
          accept={genre === 'cv' ? '.pdf,application/pdf' : ACCEPTES_LETTRE}
          required
        />
      </div>

      <button
        type="submit"
        className={`bouton${principal ? ' bouton--marque bouton--pleine-largeur' : ''}`}
        disabled={envoi}
      >
        {envoi ? 'Envoi…' : present ? 'Remplacer' : genre === 'cv' ? 'Envoyer mon CV' : 'Envoyer ma lettre'}
      </button>
    </form>
  );
}
