import Link from 'next/link';
import type { Chiffres, Demande, Document, Offre } from '@/lib/accueil';
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
  documents,
  offres,
  estReferent,
}: {
  saison: string;
  chiffres: Chiffres;
  demandes: Demande[];
  documents: Document[];
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

      <div className="deux-colonnes">
        <section className="bloc">
          <h2>Comptes-rendus &amp; affiches</h2>
          {documents.length === 0 ? (
            <p className="vide-liste">Aucun document dans votre loge.</p>
          ) : (
            <ul className="liste-nue">
              {documents.map((d) => (
                <li key={d.id}>
                  {d.lien_url ? (
                    <a href={d.lien_url} target="_blank" rel="noreferrer noopener">
                      {d.nom ?? 'Document sans nom'}
                    </a>
                  ) : (
                    <span>{d.nom ?? 'Document sans nom'}</span>
                  )}
                  {d.type_document && <span className="maigre">{d.type_document}</span>}
                </li>
              ))}
            </ul>
          )}
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
      </div>

      {estReferent && (
        <p className="maigre">
          <Link href="/espace/candidats">Voir les candidats de la loge →</Link>
        </p>
      )}
    </main>
  );
}
