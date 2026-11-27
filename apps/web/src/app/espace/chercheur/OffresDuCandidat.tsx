import Link from 'next/link';
import EtiquetteDuType from '@/components/EtiquetteDuType';
import { libelleDuLien, lienSur, nomDuDepartement, pointsDuDetail, type DetailDOffre } from '@/lib/offres';
import { departementsAProposer, parueIlYA, type OffresPourMoi } from '@/lib/page-candidat';
import type { SecteurDuCandidat } from '@/lib/secteurs';
import DepartementsDesOffres from './DepartementsDesOffres';

/**
 * « Offres pour moi » (0105), rendu par le serveur. Les offres en cours dans
 * les secteurs du candidat — de France Travail, et celles que les référents
 * saisissent (0114), qui portent l'étiquette de leur type ; le détail s'ouvre
 * sur place, sous l'offre, par l'adresse (`?offre=`), sans fenêtre par-dessus.
 */
export default function OffresDuCandidat({
  offres,
  secteurs,
  recherche,
  limite,
  ouverte,
  detail,
  maintenant,
}: {
  offres: OffresPourMoi | null;
  secteurs: SecteurDuCandidat[];
  recherche: string;
  limite: number;
  ouverte: string | null;
  detail: DetailDOffre | null;
  maintenant: number;
}) {
  const adresse = (ajout: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (recherche) p.set('q', recherche);
    if (limite > 10) p.set('plus', String(limite));
    for (const [cle, valeur] of Object.entries(ajout)) {
      if (valeur === null) p.delete(cle);
      else p.set(cle, valeur);
    }
    const suite = p.toString();
    return `/espace/chercheur${suite ? `?${suite}` : ''}#pc-offres`;
  };

  return (
    <>
      <header>
        <h2 id="pc-offres-titre">Offres pour moi</h2>
        {offres && (
          <span className="pc-compteur">
            {offres.total} offre{offres.total > 1 ? 's' : ''}
            {offres.nouvelles > 0 ? ` · ${offres.nouvelles} nouvelle${offres.nouvelles > 1 ? 's' : ''}` : ''}
          </span>
        )}
      </header>
      <p className="pc-aide">
        Les offres en cours dans vos secteurs d’activité.
      </p>

      <div className="pc-filtres">
        <div className="pc-rang">
          <span className="pc-rang-titre">Vos secteurs</span>
          {secteurs.length === 0 ? (
            <span className="pc-note">aucun</span>
          ) : (
            secteurs.map((s) => (
              <span
                key={s.code}
                className={`pc-puce pc-puce--fixe${s.confirme_le ? '' : ' pc-puce--propose'}`}
                title={s.confirme_le ? 'Confirmé par votre référent' : 'À confirmer par votre référent'}
              >
                {s.intitule}
              </span>
            ))
          )}
          <a className="pc-lien" href="#pc-champ-secteurs">
            Modifier
          </a>
        </div>

        {offres && (
          <DepartementsDesOffres
            choisis={offres.choisis}
            proposes={departementsAProposer(offres).map((d) => ({ ...d, nom: nomDuDepartement(d.code) }))}
          />
        )}

        {/* Un vrai formulaire GET : la recherche vit dans l'adresse, et marche sans script. */}
        <form className="pc-recherche" action="/espace/chercheur#pc-offres" method="get" role="search">
          <input
            type="search"
            name="q"
            defaultValue={recherche}
            maxLength={120}
            placeholder="Chercher un mot : métier, entreprise, ville…"
            aria-label="Chercher dans mes offres"
          />
        </form>
      </div>

      {!offres ? (
        <p className="pc-erreur" role="alert">
          La liste des offres n’a pas pu être lue. Réessayez dans un instant.
        </p>
      ) : offres.offres.length === 0 ? (
        <p className="pc-vide">
          {secteurs.length === 0
            ? 'Choisissez au moins un secteur dans votre fiche pour voir des offres.'
            : recherche
              ? 'Aucune offre ne contient ces mots. Essayez un autre mot.'
              : 'Aucune offre en cours ici. Cochez un autre département, ou ajoutez un secteur dans votre fiche.'}
        </p>
      ) : (
        <ul className="pc-offres">
          {offres.offres.map((o) => {
            const estOuverte = ouverte === o.id;
            const parue = parueIlYA(o.date_creation, maintenant);
            return (
              <li key={o.id} className="pc-offre">
                <Link
                  href={adresse({ offre: estOuverte ? null : o.id })}
                  scroll={false}
                  aria-expanded={estOuverte}
                  className="pc-offre-tete"
                >
                  <span className="pc-offre-titre">{o.intitule ?? 'Offre sans intitulé'}</span>
                  <span className="pc-offre-droite">
                    {o.nouvelle && <span className="pc-etiquette pc-etiquette--marque">Nouvelle</span>}
                    {o.type_offre && <EtiquetteDuType type={o.type_offre} />}
                    {parue && <span>{parue}</span>}
                  </span>
                  <span className="pc-offre-sous">
                    {[o.entreprise_nom, o.lieu_libelle, o.type_contrat_libelle].filter(Boolean).join(' · ')}
                  </span>
                </Link>
                {estOuverte && <DetailDeLOffre detail={detail} />}
              </li>
            );
          })}
        </ul>
      )}

      {offres && offres.total > offres.offres.length && (
        <p className="pc-plus">
          <Link className="bouton" href={adresse({ plus: String(limite + 10), offre: null })} scroll={false}>
            Voir {Math.min(10, offres.total - offres.offres.length)} offre
            {Math.min(10, offres.total - offres.offres.length) > 1 ? 's' : ''} de plus
          </Link>
        </p>
      )}
    </>
  );
}

function DetailDeLOffre({ detail }: { detail: DetailDOffre | null }) {
  if (!detail) {
    return <p className="pc-offre-detail pc-note">Cette offre n’est plus en ligne.</p>;
  }
  const lien = lienSur(detail.url_origine);
  return (
    <div className="pc-offre-detail">
      {detail.description && <p className="pc-offre-description">{detail.description}</p>}
      <dl className="pc-points">
        {pointsDuDetail(detail).map((p) => (
          <div key={p.libelle}>
            <dt>{p.libelle}</dt>
            <dd>{p.valeur}</dd>
          </div>
        ))}
      </dl>
      {lien && (
        <p>
          <a className="bouton" href={lien} target="_blank" rel="noopener noreferrer">
            {libelleDuLien(detail)}
          </a>
        </p>
      )}
    </div>
  );
}
