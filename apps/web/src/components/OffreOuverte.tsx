import { Fragment } from 'react';
import { dateEnLettres } from '@/lib/format';
import { lienSur, pointsDuDetail, type DetailDOffre } from '@/lib/offres';
import FenetreDeLOffre from './FenetreDeLOffre';

/**
 * Le détail d'une offre, dans sa fenêtre flottante. Le même sur l'écran
 * « France Travail » et à l'accueil — un seul composant, pour que les deux ne
 * divergent pas.
 *
 * `offre` est ce que la base a rendu pour l'identifiant demandé ; `null` :
 * l'offre n'existe pas, ou plus, et la fenêtre le dit.
 */
export default function OffreOuverte({
  demandee,
  offre,
  fermer,
}: {
  /** L'identifiant lu dans l'adresse. */
  demandee: string;
  offre: DetailDOffre | null;
  /** L'adresse de l'écran sans l'offre : où mène la croix. */
  fermer: string;
}) {
  return (
    <FenetreDeLOffre
      // Une autre offre : une autre fenêtre, qui revient en haut de son texte.
      key={demandee}
      titre={offre?.intitule ?? (offre ? 'Offre sans intitulé' : 'Offre introuvable')}
      fermer={fermer}
    >
      {offre ? <DetailDeLOffre offre={offre} /> : <p>Cette offre n’existe plus.</p>}
    </FenetreDeLOffre>
  );
}

/**
 * Le contenu de la fenêtre : l'entreprise, les points de l'offre, sa
 * description, et le lien vers sa page chez France Travail.
 *
 * Tout ce texte vient de l'extérieur. Il est affiché comme du texte — jamais
 * comme du HTML — et les adresses ne deviennent des liens qu'en `http(s)`.
 */
function DetailDeLOffre({ offre }: { offre: DetailDOffre }) {
  const points = pointsDuDetail(offre);
  const origine = lienSur(offre.url_origine);
  const site = lienSur(offre.entreprise_url);
  const date = dateEnLettres(offre.date_actualisation ?? offre.date_creation);

  return (
    <>
      {(offre.entreprise_nom || date) && (
        <p className="maigre fenetre-offre-chapeau">
          {[offre.entreprise_nom, date ? `actualisée le ${date}` : null].filter(Boolean).join(' · ')}
        </p>
      )}

      {points.length > 0 && (
        <dl className="champs">
          {points.map((p) => (
            <Fragment key={p.libelle}>
              <dt>{p.libelle}</dt>
              <dd>{p.valeur}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {offre.description && <p className="fenetre-offre-texte">{offre.description}</p>}

      {(offre.entreprise_description || offre.entreprise_taille || site) && (
        <div className="fenetre-offre-entreprise">
          <h3>L’entreprise</h3>
          {offre.entreprise_description && (
            <p className="fenetre-offre-texte">{offre.entreprise_description}</p>
          )}
          {offre.entreprise_taille && <p className="maigre">{offre.entreprise_taille}</p>}
          {site && (
            <p>
              <a href={site} target="_blank" rel="noopener noreferrer">
                Site de l’entreprise ↗
              </a>
            </p>
          )}
        </div>
      )}

      {origine && (
        <p>
          <a className="filtre" href={origine} target="_blank" rel="noopener noreferrer">
            Voir l’offre sur France Travail ↗
          </a>
        </p>
      )}
    </>
  );
}
