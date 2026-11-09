import Link from 'next/link';
import { Corbeille } from '@/components/Icones';
import {
  COLONNES,
  SORTES,
  type Adresse,
  type DocumentArchive,
  type Sorte,
} from '@/lib/documents/archives';

/**
 * Les trois colonnes des PDF archivés — Compte-rendu, Affiche, Affichette
 * (migration 0069).
 *
 * Le même tableau à deux endroits : l'accueil, pour l'exercice en cours, et
 * Paramètres › Archives, pour les exercices précédents. Un seul composant,
 * pour qu'ils ne divergent pas.
 *
 * `adresse` est la page qui le montre : la corbeille y ouvre la fenêtre de
 * confirmation, et l'effacement y ramène.
 */
export default function ColonnesDesArchives({
  colonnes,
  adresse,
  avant = false,
}: {
  colonnes: Record<Sorte, DocumentArchive[]>;
  adresse: Adresse;
  /** Les exercices précédents : la colonne vide le dit autrement. */
  avant?: boolean;
}) {
  return (
    <div className="archives">
      {SORTES.map((sorte) => (
        <div key={sorte} className="archives-colonne">
          <h3>{COLONNES[sorte].titre}</h3>
          {colonnes[sorte].length === 0 ? (
            <p className="archives-vide">
              {avant ? COLONNES[sorte].videAvant : COLONNES[sorte].vide}
            </p>
          ) : (
            <ul className="liste-nue">
              {colonnes[sorte].map((d) => (
                <li key={d.id} className="archives-ligne">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                    {d.nom ?? 'Document sans nom'}
                  </a>
                  {/* Rouge, sur la ligne même du PDF, et seulement là où la
                      base accepterait d'effacer : administrateur, Vénérable
                      Maître, Secrétaire. La corbeille n'efface pas : elle
                      ouvre la confirmation. */}
                  {d.effacable && (
                    <Link
                      href={`${adresse}?effacer=${d.id}`}
                      scroll={false}
                      className="geste geste--retirer"
                      aria-label={`Effacer ${d.nom ?? 'ce PDF'}`}
                      title="Effacer ce PDF"
                    >
                      <Corbeille />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

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
export function FenetreDEffacement({
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
