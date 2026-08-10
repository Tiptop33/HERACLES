'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Déposer une photo, ou la retirer.
 *
 * Le même bloc sur deux écrans : la fiche d'un référent, où un administrateur
 * s'occupe de la photo de quelqu'un d'autre, et « Mon compte », où chacun
 * s'occupe de la sienne. Seules changent l'adresse qui reçoit et la page où
 * l'on revient — le geste, lui, est le même, et il n'y a aucune raison qu'il
 * se comporte différemment d'un écran à l'autre.
 *
 * Un formulaire à part, et non un champ de plus dans celui de la fiche : ce
 * dernier part en JSON, ce qu'un fichier ne sait pas faire. Les mêler
 * obligerait à convertir l'image en texte pour la faire tenir dans le même
 * envoi — plus lourd, plus fragile, et sans rien y gagner.
 *
 * Comme partout ici, il fonctionne sans JavaScript : `method`, `action` et
 * `encType` sont déclarés sur le `<form>`, et la route sait répondre aux deux
 * formes. Ce qui compte pendant que JavaScript charge compte aussi quand il ne
 * charge pas.
 */
export default function DepotDePhoto({
  action,
  retour,
  aUnePhoto,
  titre = 'La photo',
}: {
  /** La route qui reçoit le fichier. */
  action: string;
  /** La page où l'on revient, et sur laquelle s'ouvre la confirmation. */
  retour: string;
  /** Ce qui change le libellé du bouton, et fait apparaître « Retirer ». */
  aUnePhoto: boolean;
  titre?: string;
}) {
  const router = useRouter();
  const formulaire = useRef<HTMLFormElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch(action, {
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
      // navigateur, qui la garde cinq minutes — sans quoi le portrait
      // resterait l'ancien, et le dépôt aurait l'air d'avoir échoué.
      router.replace(`${retour}?maj=${resultat.maj ?? ''}`);
      router.refresh();
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="bloc">
      <h2>{titre}</h2>

      {erreur && <p className="erreur">{erreur}</p>}

      <form
        ref={formulaire}
        onSubmit={soumettre}
        action={action}
        method="post"
        encType="multipart/form-data"
        className="photo-depot"
      >
        {/* Le chemin ordinaire, qui marche partout : au clavier, sans souris,
            et sans JavaScript. Le glisser-déposer se fait sur le portrait
            lui-même (voir `PortraitDeposable`) — c'est un raccourci à la
            souris, pas le seul moyen de déposer une photo. */}
        <label className="champ">
          <span>{aUnePhoto ? 'Remplacer la photo' : 'Déposer une photo'}</span>
          <input
            ref={champ}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            onChange={(e) => setChoisi(e.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>

        {/* « Retirer » n'est plus ici mais sous le portrait (`PortraitDeposable`) :
            le geste qui enlève une photo est là où la photo se trouve, et il
            n'y a aucune raison qu'il existe à deux endroits. */}
        <button type="submit" className="bouton bouton--fort" disabled={envoi || !choisi}>
          {envoi ? 'Dépôt…' : aUnePhoto ? 'Remplacer' : 'Déposer'}
        </button>
      </form>

      <p className="aide">
        La photo est facultative : une fiche sans visage fonctionne comme les autres, et
        rien n’oblige à en déposer une. JPEG, PNG, WebP, GIF ou AVIF, 5 Mo au plus. Elle
        n’est jamais servie par une adresse publique : elle passe par l’application, qui
        vérifie d’abord qui la demande.
      </p>
    </section>
  );
}
