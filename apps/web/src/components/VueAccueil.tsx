import Link from 'next/link';
import ColonnesDesArchives from '@/components/ColonnesDesArchives';
import FenetreDArchivage from '@/components/FenetreDArchivage';
import FenetreDEffacement from '@/components/FenetreDEffacement';
import type { Chiffres, Demande, DossierAArchiver, Offre } from '@/lib/accueil';
import type { DocumentArchive, Sorte } from '@/lib/documents/archives';
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
  aArchiver = [],
  refusDArchivage = null,
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
  /** Les dossiers clôturés depuis plus de deux mois, pour le Vénérable et le Secrétaire (0071). */
  aArchiver?: DossierAArchiver[];
  /** Ce que la route d'archivage a refusé, dit en clair. */
  refusDArchivage?: string | null;
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

      <section className="bloc" data-aide="urgences">
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
          réglé dans Paramètres › Exercice. */}
      <section className="bloc" data-aide="documents-commission">
        <h2>Comptes-rendus, affiches et affichettes</h2>
        {refusDArchive && (
          <p className="erreur" role="alert">
            {refusDArchive}
          </p>
        )}
        <ColonnesDesArchives colonnes={archives} adresse="/espace/accueil" />
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

      {aEffacer && <FenetreDEffacement archive={aEffacer} adresse="/espace/accueil" />}

      {/* Une fenêtre à la fois : la confirmation d'un effacement passe avant. */}
      {!aEffacer && aArchiver.length > 0 && (
        <FenetreDArchivage dossiers={aArchiver} refus={refusDArchivage} />
      )}
    </main>
  );
}
