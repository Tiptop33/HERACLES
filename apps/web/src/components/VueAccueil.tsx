import Link from 'next/link';
import { Corbeille } from '@/components/Icones';
import type { Chiffres, Demande, Offre } from '@/lib/accueil';
import { COLONNES, SORTES, type DocumentArchive, type Sorte } from '@/lib/documents/archives';
import { depuis, initiales, nomComplet } from '@/lib/format';

/**
 * L'accueil de la maquette `1a`, sans sa lecture de données.
 *
 * La page qui l'emploie va chercher les chiffres ; celui-ci ne fait que les
 * montrer. La séparation permet de regarder l'écran sans la pile Supabase —
 * et c'est en le regardant qu'on voit ce qu'on avait mal imaginé.
 */
/**
 * Les quatre familles de recherche, dans l'ordre où elles s'affichent.
 *
 * « Changement d'emploi » est venu en dernier (migration 0032) et y reste :
 * ce sont trois fiches sur cent sept, et l'œil doit trouver « Emploi » en
 * tête. Chercher un premier emploi et vouloir en changer n'appellent pas le
 * même accompagnement — les confondre annonçait 55 emplois pour 52.
 */
export const FAMILLES = [
  { cle: 'emploi', libelle: 'Emploi' },
  { cle: 'alternance', libelle: 'Alternance' },
  { cle: 'stage', libelle: 'Stage' },
  { cle: 'changement', libelle: 'Changement d’emploi' },
] as const;

export default function VueAccueil({
  saison,
  chiffres,
  demandes,
  archives,
  aEffacer,
  refusDArchive,
  offres,
  estReferent,
}: {
  saison: string;
  chiffres: Chiffres;
  demandes: Demande[];
  /** Les PDF archivés de la période, rangés dans leurs trois colonnes (0069). */
  archives: Record<Sorte, DocumentArchive[]>;
  /** La ligne dont la corbeille a été touchée : la fenêtre de confirmation s'ouvre. */
  aEffacer: DocumentArchive | null;
  /** Ce que la route d'effacement a refusé, dit en clair. */
  refusDArchive: string | null;
  offres: Offre[];
  estReferent: boolean;
}) {
  const compteurs = [
    // « de la loge » sur les deux cadres qui en parlent : depuis la migration
    // 0030, celui-ci compte les candidats accompagnés de la loge entière, et
    // non les seuls dossiers de qui regarde. Sans ces trois mots, on lisait
    // « les miens ».
    { n: chiffres.mesCandidats, l: 'candidats suivis de la loge' },
    { n: chiffres.enAttente, l: 'en attente de référent' },
    { n: chiffres.offresEnCours, l: 'offres en cours' },
    { n: chiffres.referents, l: 'référents de la loge' },
  ];

  return (
    <main className="corps">
      <div className="page-titre">
        <h1>Accueil</h1>
        {/* La maquette annonce ici la prochaine réunion. Il n'y a pas de table
            `reunion` : la reprise Bubble n'en contenait pas. On dit la saison,
            et rien qu'elle, plutôt que d'afficher une date inventée. */}
        <p className="maigre">Saison {saison}</p>
      </div>

      <div className="compteurs">
        {compteurs.map((c) => (
          <div key={c.l} className="compteur">
            <span className="compteur-n">{c.n}</span>
            <span className="compteur-l">{c.l}</span>
          </div>
        ))}
      </div>

      <section className="bloc">
        <div className="bloc-tete">
          <h2>Urgences — nouvelles demandes</h2>
          <div className="pastilles">
            {FAMILLES.map((f) => (
              <span key={f.cle} className="pastille-compte">
                {f.libelle} {chiffres.urgences[f.cle]}
              </span>
            ))}
          </div>
        </div>

        {demandes.length === 0 ? (
          <p className="vide-liste">
            Personne n&apos;attend de référent. Tout le monde est accompagné.
          </p>
        ) : (
          <div className="cartes">
            {demandes.map((d) => (
              <article key={d.id} className="carte-demande">
                <span className="initiales" aria-hidden="true">
                  {initiales(d.prenom, d.nom)}
                </span>
                <p className="carte-nom">{nomComplet(d.prenom, d.nom) || 'Sans nom'}</p>
                <p className="maigre">{d.ville ?? '—'}</p>
                <p className="maigre">
                  {/* « Emploi » par défaut était un mensonge commode : une
                      recherche non renseignée s'affichait comme un emploi, et
                      rien ne disait qu'il y avait une colonne à remplir. */}
                  {FAMILLES.find((f) => f.cle === d.famille)?.libelle ?? 'Type non renseigné'}
                  {d.cree_le ? ` · ${depuis(d.cree_le)}` : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Les trois colonnes en pleine largeur, à la place de l'ancien cadre
          « Comptes-rendus & affiches » : chaque PDF que la feuille d'appel
          produit y est archivé (migration 0069). La période est l'exercice
          en cours, du 1er septembre au 31 juillet. */}
      <section className="bloc">
        <h2>Comptes-rendus, affiches et affichettes</h2>
        {refusDArchive && (
          <p className="erreur" role="alert">
            {refusDArchive}
          </p>
        )}
        <div className="archives">
          {SORTES.map((sorte) => (
            <div key={sorte} className="archives-colonne">
              <h3>{COLONNES[sorte].titre}</h3>
              {archives[sorte].length === 0 ? (
                <p className="archives-vide">{COLONNES[sorte].vide}</p>
              ) : (
                <ul className="liste-nue">
                  {archives[sorte].map((d) => (
                    <li key={d.id} className="archives-ligne">
                      <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                        {d.nom ?? 'Document sans nom'}
                      </a>
                      {/* Rouge, sur la ligne même du PDF, et seulement là où
                          la base accepterait d'effacer : administrateur,
                          Vénérable Maître, Secrétaire. La corbeille n'efface
                          pas : elle ouvre la confirmation. */}
                      {d.effacable && (
                        <Link
                          href={`/espace/accueil?effacer=${d.id}`}
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
      </section>

      <section className="bloc">
        <h2>Offres d&apos;emploi en cours</h2>
        {offres.length === 0 ? (
          <p className="vide-liste">Aucune offre en cours.</p>
        ) : (
          <ul className="liste-nue">
            {offres.map((o) => (
              <li key={o.id}>
                <span>{o.intitule ?? 'Offre sans intitulé'}</span>
                <span className="maigre">
                  {[o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {estReferent && (
        <p className="maigre">
          <Link href="/espace/candidats">Voir les candidats de la loge →</Link>
        </p>
      )}

      {aEffacer && <FenetreDEffacement archive={aEffacer} />}
    </main>
  );
}

/**
 * La fenêtre de confirmation avant d'effacer un PDF archivé — la même que pour
 * supprimer un dossier.
 *
 * Elle dit ce qu'on perd, plutôt que « êtes-vous sûr ? ». Rendue par le
 * serveur sur la seule foi de l'adresse : elle s'ouvre sans une ligne de
 * script, et le bouton « retour » du navigateur la referme, comme un clic à
 * côté ou « Annuler ».
 */
function FenetreDEffacement({ archive }: { archive: DocumentArchive }) {
  const nom = archive.nom ?? 'ce PDF';

  return (
    <div className="fenetre-fond">
      <Link
        href="/espace/accueil"
        scroll={false}
        className="fenetre-voile"
        aria-label="Fermer sans rien effacer"
      />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="effacement-titre">
        <h2 id="effacement-titre">Effacer « {nom} »&nbsp;?</h2>

        <p>
          Le PDF disparaîtra de HERACLES pour <strong>toute la loge</strong> : il ne s’ouvrira
          plus depuis l’accueil.
        </p>

        <p className="aide">Cela ne se défait pas.</p>

        <div className="fenetre-gestes">
          <Link href="/espace/accueil" scroll={false} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/documents/${archive.id}/effacer`}>
            <button className="bouton bouton--danger" type="submit">
              Effacer le PDF
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
