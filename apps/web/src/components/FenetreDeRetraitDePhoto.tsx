import Link from 'next/link';

/**
 * La fenêtre de confirmation avant de retirer une photo.
 *
 * Elle dit **ce qu'on perd**, plutôt que « êtes-vous sûr ? » — une question à
 * laquelle on répond oui sans lire. Et ce qu'on perd est réel : le fichier
 * quitte le stockage, et l'adresse d'origine chez Bubble part avec lui, sans
 * quoi la prochaine reprise remettrait le visage en place (migrations 0049
 * et 0050).
 *
 * Rendue par le serveur, sur la seule foi de l'adresse : elle s'ouvre sans une
 * ligne de script, et le bouton « retour » du navigateur la referme.
 */
export default function FenetreDeRetraitDePhoto({
  action,
  retour,
  titre,
  sienne = false,
}: {
  /** La route qui reçoit le retrait. */
  action: string;
  /** La page où l'on revient en annulant. */
  retour: string;
  titre: string;
  /** Sa propre photo, ou celle de quelqu'un d'autre : le texte change. */
  sienne?: boolean;
}) {
  return (
    <div className="fenetre-fond">
      <Link href={retour} className="fenetre-voile" aria-label="Fermer sans rien retirer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="retrait-photo">
        <h2 id="retrait-photo">{titre}</h2>

        <p>
          Le fichier <strong>quittera le stockage</strong>, et {sienne ? 'votre' : 'la'} fiche
          n’aura plus de visage — dans l’annuaire, sur la feuille d’appel et dans la colonne
          de gauche.
        </p>

        <p className="aide">
          Rien ne défait ce geste. Si la photo venait de Bubble, son adresse d’origine est
          effacée elle aussi : sans cela, la prochaine reprise la remettrait en place. Pour
          changer de portrait sans le perdre, fermez cette fenêtre et déposez-en un autre.
        </p>

        <div className="fenetre-gestes">
          <Link href={retour} className="bouton">
            Annuler
          </Link>
          <form method="post" action={action} encType="multipart/form-data">
            <input type="hidden" name="geste" value="retirer" />
            <button className="bouton bouton--danger" type="submit">
              Retirer la photo
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
