'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

/**
 * Le portrait, et le geste de souris qui le change.
 *
 * On glisse une photo dessus, ou l'on double-clique dedans pour aller la
 * chercher sur l'ordinateur. C'est l'endroit où l'on regarde quand on veut
 * changer un visage — autant que ce soit l'endroit où on le change.
 *
 * **Un raccourci, et non le seul chemin.** Le bloc « La photo », plus bas,
 * garde son champ de fichier et son bouton : c'est lui qui fonctionne au
 * clavier, sans souris, et sans JavaScript. Ce composant-ci ne fait rien qu'on
 * ne puisse faire autrement, et c'est délibéré — un geste à la souris ne doit
 * jamais être la seule porte d'entrée.
 *
 * Le portrait peut rester vide : une fiche sans visage est une fiche normale.
 * La zone est alors celle des initiales, et le geste y fonctionne pareil —
 * c'est même là qu'on s'en sert le plus, puisqu'il n'y a rien encore.
 */
export default function PortraitDeposable({
  action,
  retour,
  src,
  initiales,
}: {
  /** La route qui reçoit le fichier. */
  action: string;
  /** La page où revenir après le dépôt. */
  retour: string;
  /** L'adresse de la photo, ou `null` quand il n'y en a pas. */
  src: string | null;
  /** Ce qui s'affiche à sa place : les initiales. */
  initiales: string;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function deposer(fichier: File | undefined) {
    if (!fichier || envoi) return;

    // Le navigateur devine ce type d'après l'extension : ce n'est pas une
    // preuve, et le serveur lira les octets de toute façon. Cela évite
    // seulement d'envoyer un PDF de quatre mégaoctets pour rien.
    if (!fichier.type.startsWith('image/')) {
      setErreur('Ce fichier n’est pas une image.');
      return;
    }

    setErreur(null);
    setEnvoi(true);

    try {
      const paquet = new FormData();
      paquet.append('photo', fichier);

      const reponse = await fetch(action, { method: 'POST', body: paquet });
      const resultat = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(resultat.erreur ?? 'Le dépôt de l’image a échoué.');
        return;
      }

      // Un rechargement franc plutôt que `router.refresh()` : le portrait est
      // rendu par le serveur, et `maj` doit entrer dans son adresse pour que
      // le navigateur redemande l'image — il la garde cinq minutes.
      window.location.href = `${retour}?maj=${resultat.maj ?? ''}`;
    } catch {
      setErreur('La connexion au serveur a échoué. Réessayez.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="portrait-depot">
      <div
        className="portrait-cible"
        data-survol={survol || undefined}
        data-envoi={envoi || undefined}
        title="Glissez une photo ici, ou double-cliquez pour la chercher sur votre ordinateur"
        onDragEnter={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragOver={(e) => {
          // Sans ce refus du comportement par défaut, le navigateur ouvre
          // l'image à la place de la recevoir, et la page est perdue.
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          void deposer(e.dataTransfer.files?.[0]);
        }}
        onDoubleClick={() => champ.current?.click()}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="portrait" src={src} alt="" width={67} height={67} />
        ) : (
          <span className="portrait initiales-portrait" aria-hidden="true">
            {initiales}
          </span>
        )}

        {envoi && <span className="portrait-envoi">Dépôt…</span>}
      </div>

      {/* Sous la photo, et large comme elle : le geste qui l'enlève est là où
          elle est, et non dans un bloc plus bas où il faudrait aller le
          chercher. Rien quand il n'y a pas de visage — il n'y aurait rien à
          retirer.

          Un lien, et non un bouton : il n'envoie rien, il ouvre la fenêtre de
          confirmation, laquelle n'est qu'une adresse — donc le bouton
          « retour » du navigateur la referme. */}
      {src && (
        <Link
          href={`${retour}?photo=retirer`}
          className="bouton bouton--danger portrait-retirer"
        >
          Retirer
        </Link>
      )}

      {/* Hors de tout formulaire, et jamais soumis : il ne sert qu'à ouvrir
          l'explorateur de fichiers au double-clic. Le champ visible du bloc
          « La photo » reste, lui, le chemin ordinaire. */}
      <input
        ref={champ}
        type="file"
        className="visuellement-cache"
        tabIndex={-1}
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={(e) => void deposer(e.currentTarget.files?.[0])}
      />

      {erreur && <p className="portrait-erreur">{erreur}</p>}
    </div>
  );
}
