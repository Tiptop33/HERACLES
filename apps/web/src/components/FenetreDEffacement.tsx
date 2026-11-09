import Link from 'next/link';
import type { Adresse, DocumentArchive } from '@/lib/documents/archives';

/**
 * La fenêtre de confirmation avant d'effacer un PDF archivé — la même que pour
 * supprimer un dossier.
 *
 * Elle dit ce qu'on perd, plutôt que « êtes-vous sûr ? ». Rendue par le
 * serveur sur la seule foi de l'adresse : elle s'ouvre sans une ligne de
 * script, et le bouton « retour » du navigateur la referme, comme un clic à
 * côté ou « Annuler ». Le formulaire dit d'où l'on vient, pour y revenir ; la
 * route n'accepte que les deux pages qui montrent ces colonnes.
 */
export default function FenetreDEffacement({
  archive,
  adresse,
}: {
  archive: DocumentArchive;
  adresse: Adresse;
}) {
  const nom = archive.nom ?? 'ce PDF';
  const ou = adresse === '/espace/accueil' ? 'l’accueil' : 'les archives';

  return (
    <div className="fenetre-fond">
      <Link href={adresse} scroll={false} className="fenetre-voile" aria-label="Fermer sans rien effacer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="effacement-titre">
        <h2 id="effacement-titre">Effacer « {nom} »&nbsp;?</h2>

        <p>
          Le PDF disparaîtra de HERACLES pour <strong>toute la loge</strong> : il ne s’ouvrira
          plus depuis {ou}.
        </p>

        <p className="aide">Cela ne se défait pas.</p>

        <div className="fenetre-gestes">
          <Link href={adresse} scroll={false} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/documents/${archive.id}/effacer`}>
            <input type="hidden" name="retour" value={adresse} />
            <button className="bouton bouton--danger" type="submit">
              Effacer le PDF
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
