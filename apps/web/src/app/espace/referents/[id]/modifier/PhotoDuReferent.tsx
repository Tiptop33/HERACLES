'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Déposer la photo d'un référent.
 *
 * Un formulaire à part, et non un champ de plus dans le formulaire de la
 * fiche : celui-ci part en JSON, ce qu'un fichier ne sait pas faire. Les mêler
 * obligerait à convertir l'image en texte pour la faire tenir dans le même
 * envoi — plus lourd, plus fragile, et sans rien y gagner.
 *
 * Comme partout ici, il fonctionne sans JavaScript : `method`, `action` et
 * `encType` sont déclarés sur le `<form>`, et la route sait répondre aux deux
 * formes. Ce qui compte pendant que JavaScript charge compte aussi quand il ne
 * charge pas.
 */
export default function PhotoDuReferent({
  id,
  aUnePhoto,
}: {
  id: string;
  /** Ce qui change le libellé du bouton : déposer, ou remplacer. */
  aUnePhoto: boolean;
}) {
  const router = useRouter();
  const formulaire = useRef<HTMLFormElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch(`/api/referents/${id}/photo`, {
        method: 'POST',
        body: new FormData(evenement.currentTarget),
      });
      const resultat = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(resultat.erreur ?? 'Le dépôt de l’image a échoué.');
        return;
      }

      // Le champ se vide : le fichier est déposé, le garder affiché laisserait
      // croire qu'il reste quelque chose à envoyer.
      formulaire.current?.reset();
      setChoisi(null);

      // `maj` vient de la route. Il ne sert qu'à faire redemander la photo au
      // navigateur, qui la garde cinq minutes — sans quoi le portrait du haut
      // resterait l'ancien, et le dépôt aurait l'air d'avoir échoué.
      router.replace(`/espace/referents/${id}/modifier?maj=${resultat.maj ?? ''}`);
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="bloc">
      <h2>La photo</h2>

      {erreur && <p className="erreur">{erreur}</p>}

      <form
        ref={formulaire}
        onSubmit={soumettre}
        action={`/api/referents/${id}/photo`}
        method="post"
        encType="multipart/form-data"
        className="photo-depot"
      >
        <label className="champ">
          <span>{aUnePhoto ? 'Remplacer la photo' : 'Déposer une photo'}</span>
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            onChange={(e) => setChoisi(e.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>

        <button type="submit" className="bouton bouton--fort" disabled={envoi || !choisi}>
          {envoi ? 'Dépôt…' : aUnePhoto ? 'Remplacer' : 'Déposer'}
        </button>

        {/* Un lien, et non un bouton dans ce formulaire-ci : il n'envoie rien,
            il ouvre la fenêtre de confirmation — laquelle n'est qu'une adresse,
            donc le bouton « retour » du navigateur la referme. */}
        {aUnePhoto && (
          <Link
            href={`/espace/referents/${id}/modifier?photo=retirer`}
            className="bouton bouton--danger"
          >
            Retirer
          </Link>
        )}
      </form>

      <p className="aide">
        JPEG, PNG, WebP, GIF ou AVIF, 5 Mo au plus. La photo n’est jamais servie par une
        adresse publique : elle passe par l’application, qui vérifie d’abord qui la demande.
      </p>
    </section>
  );
}
