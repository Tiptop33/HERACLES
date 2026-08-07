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
export const FAMILLES = [
  { cle: 'emploi', libelle: 'Emploi' },
  { cle: 'alternance', libelle: 'Alternance' },
  { cle: 'stage', libelle: 'Stage' },
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
    { n: chiffres.mesCandidats, l: 'candidats suivis' },
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
                  {FAMILLES.find((f) => f.cle === d.famille)?.libelle ?? 'Emploi'}
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
          <Link href="/espace/candidats?vue=suivis">Voir tous mes candidats →</Link>
        </p>
      )}
    </main>
  );
}
