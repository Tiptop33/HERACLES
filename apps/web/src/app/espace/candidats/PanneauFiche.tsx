import Link from 'next/link';
import BoutonImprimer from '@/components/BoutonImprimer';
import { Stylo } from '@/components/Icones';
import { DrapeauFrance } from '../referents/DrapeauFrance';
import { dateEnLettres, enEtiquettes, initiales, telephone } from '@/lib/format';
import { nomDeFamilleDabord, type FicheOuverte, type LigneCandidat } from '@/lib/poste';

/**
 * Le volet de droite du poste de travail : l'en-tête de la personne, les
 * onglets, et le contenu de l'onglet ouvert.
 *
 * Les onglets sont des liens, et non des boutons qui masquent des blocs déjà
 * rendus : ce qu'on ne regarde pas n'est pas envoyé au navigateur. Un CV et une
 * appréciation ne traversent pas le réseau « au cas où ».
 */

export const ONGLETS = [
  { valeur: 'profil', libelle: 'Profil' },
  { valeur: 'documents', libelle: 'Documents' },
  { valeur: 'suivi', libelle: 'Suivi & tâches', lot: 'lot 4' },
  { valeur: 'offres', libelle: 'Offres proposées', lot: 'lot 4' },
] as const;

export type Onglet = (typeof ONGLETS)[number]['valeur'];

/** Seuls les onglets construits s'ouvrent : les autres restent éteints. */
export function estOnglet(valeur: unknown): valeur is Onglet {
  return valeur === 'profil' || valeur === 'documents';
}

/** Une valeur, ou la mention en italique de son absence. */
function Valeur({ children, absent = 'non renseigné' }: { children?: unknown; absent?: string }) {
  const vide =
    children === null ||
    children === undefined ||
    (typeof children === 'string' && children.trim() === '');

  if (vide) return <dd className="vide">{absent}</dd>;
  return <dd>{children as React.ReactNode}</dd>;
}

export default function PanneauFiche({
  fiche,
  rang,
  onglet,
  adresse,
}: {
  fiche: FicheOuverte;
  /** La ligne correspondante de la liste, quand la vue courante la contient. */
  rang: LigneCandidat | null;
  onglet: Onglet;
  adresse: (ajout: Record<string, string | null>) => string;
}) {
  const nom = nomDeFamilleDabord(fiche.nom, fiche.prenom);
  const metier = fiche.metier_libelle ?? fiche.emploi_recherche ?? rang?.metier ?? null;

  return (
    <>
      <div className="poste-tete">
        {fiche.a_une_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="poste-tete-portrait"
            src={`/espace/candidats/${fiche.id}/photo`}
            alt=""
            width={52}
            height={52}
          />
        ) : (
          <span className="poste-tete-portrait poste-tete-initiales" aria-hidden="true">
            {initiales(fiche.prenom, fiche.nom)}
          </span>
        )}

        <div className="poste-tete-textes">
          <h1>
            {nom}
            {fiche.age ? ` · ${fiche.age} ans` : ''}
          </h1>
          <p className="sous">
            {[metier, fiche.numero ? `N° ${fiche.numero}` : null].filter(Boolean).join(' · ') ||
              'métier non renseigné'}
          </p>

          <div className="etiquettes">
            <span className={`etat etat--${fiche.suivi.etat}`}>{fiche.suivi.libelle}</span>
            <span className="etiquette">
              Référent&nbsp;: {fiche.referent_nom ?? 'aucun'}
            </span>
            {fiche.parrain_nom && (
              <span className="etiquette">Parrain&nbsp;: {fiche.parrain_nom}</span>
            )}
            {fiche.loge_nom && <span className="etiquette">{fiche.loge_nom}</span>}
            <span className="etiquette">Fiche remplie à {fiche.remplissage}&nbsp;%</span>
          </div>
        </div>

        <div className="fiche-actions">
          <BoutonImprimer />

          {/* Éteint, et à sa place définitive : c'est le geste que la maquette
              met ici, et le lot 4 l'apportera. */}
          <span className="bouton bouton--eteint" title="À venir au lot 4">
            Proposer une offre
          </span>

          {/* Le stylo n'apparaît que pour qui accompagne — et s'il apparaissait
              à tort, la base refuserait quand même : c'est elle qui décide,
              pas cette ligne. */}
          {fiche.modifiable && (
            <Link
              href={`/espace/referent/candidats/${fiche.id}/modifier`}
              className="geste geste--corriger"
              aria-label={`Corriger la fiche de ${nom}`}
              title="Corriger cette fiche"
            >
              <Stylo />
            </Link>
          )}
        </div>
      </div>

      <nav className="poste-onglets" aria-label="Parties de la fiche">
        {ONGLETS.map((o) =>
          'lot' in o ? (
            <span key={o.valeur} className="poste-onglet poste-onglet--eteint" title={`À venir au ${o.lot}`}>
              {o.libelle}
            </span>
          ) : (
            <Link
              key={o.valeur}
              href={adresse({ onglet: o.valeur === 'profil' ? null : o.valeur })}
              className="poste-onglet"
              aria-current={onglet === o.valeur}
            >
              {o.libelle}
            </Link>
          ),
        )}
      </nav>

      <div className="poste-contenu">
        {onglet === 'documents' ? <Documents fiche={fiche} /> : <Profil fiche={fiche} />}
      </div>
    </>
  );
}

function Profil({ fiche }: { fiche: FicheOuverte }) {
  const lieu = fiche.ville ?? fiche.adresse;
  const lieuComplet = [lieu, fiche.code_postal ? `(${fiche.code_postal})` : null]
    .filter(Boolean)
    .join(' ');

  const tel = telephone(fiche.telephone);

  const parcours = [fiche.formations, fiche.experiences]
    .map((bloc) => bloc?.trim())
    .filter(Boolean)
    .join('\n\n');

  const etiquettes = [
    ...enEtiquettes(fiche.competences),
    ...enEtiquettes(fiche.savoir_etre),
    ...enEtiquettes(fiche.informatique),
  ];

  const permis = [fiche.permis_vl, fiche.vehicule].filter(Boolean).join(' · ');

  return (
    <div className="blocs">
      <section className="bloc">
        <h2>Identité et contact</h2>
        <dl className="champs">
          <dt>Âge</dt>
          <Valeur>{fiche.age ? `${fiche.age} ans` : null}</Valeur>
          <dt>Situation</dt>
          <Valeur>{fiche.situation_familiale}</Valeur>
          <dt>Téléphone</dt>
          <Valeur>
            {tel && (
              <span className="ligne-telephone">
                {tel.francais && <DrapeauFrance />}
                <a href={`tel:${tel.lien}`}>{tel.affiche}</a>
              </span>
            )}
          </Valeur>
          <dt>Email</dt>
          <Valeur>{fiche.email && <a href={`mailto:${fiche.email}`}>{fiche.email}</a>}</Valeur>
          <dt>Adresse</dt>
          <Valeur>{lieuComplet}</Valeur>
        </dl>
      </section>

      <section className="bloc">
        <h2>Sa recherche</h2>
        <dl className="champs">
          <dt>Type</dt>
          <Valeur>{fiche.type_emploi}</Valeur>
          <dt>Métier</dt>
          <Valeur>{fiche.emploi_recherche ?? fiche.metier_libelle}</Valeur>
          <dt>Mobilité</dt>
          <Valeur>{fiche.mobilite_geographique}</Valeur>
          <dt>Disponible</dt>
          <Valeur>{dateEnLettres(fiche.debut_stage)}</Valeur>
          <dt>Secteur</dt>
          <Valeur>{fiche.secteur_activite_libelle}</Valeur>
          <dt>Permis</dt>
          <Valeur>{permis}</Valeur>
        </dl>
      </section>

      <section className="bloc">
        <h2>Accompagnement</h2>
        <dl className="champs">
          <dt>Référent</dt>
          <Valeur absent="personne">{fiche.referent_nom}</Valeur>
          <dt>Parrain</dt>
          <Valeur absent="personne">{fiche.parrain_nom}</Valeur>
          <dt>Loge</dt>
          <Valeur>{fiche.loge_nom}</Valeur>
          <dt>Appréciation</dt>
          <Valeur>{fiche.appreciation}</Valeur>
          <dt>Clôture</dt>
          <Valeur absent="non clôturé">{fiche.cloture}</Valeur>
        </dl>
      </section>

      <section className="bloc bloc--large">
        <h2>Parcours</h2>
        {parcours ? (
          <p className="prose">{parcours}</p>
        ) : (
          <p className="prose maigre">
            <em>Ni formation ni expérience renseignée pour l’instant.</em>
          </p>
        )}

        {etiquettes.length > 0 && (
          <div className="etiquettes" style={{ marginTop: '0.8rem' }}>
            {etiquettes.map((mot, position) => (
              <span className="etiquette" key={`${mot}-${position}`}>
                {mot}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="bloc">
        <h2>Historique</h2>
        <dl className="champs">
          <dt>Créée le</dt>
          <Valeur>{dateEnLettres(fiche.cree_le)}</Valeur>
          <dt>Modifiée le</dt>
          <Valeur>{dateEnLettres(fiche.maj_le)}</Valeur>
          <dt>Origine</dt>
          <Valeur>{fiche.bubble_id ? 'Reprise Bubble' : 'Saisie dans HERACLES'}</Valeur>
        </dl>
      </section>
    </div>
  );
}

/**
 * Les documents, en cartes, comme sur la maquette.
 *
 * Trois états, et il faut les trois : le fichier est chez nous et s'ouvre ;
 * il est encore chez Bubble et ne s'ouvre pas — c'est ce que MAJBUBBLE
 * rapatriera avant le 5 décembre ; ou il n'a jamais existé.
 */
function Documents({ fiche }: { fiche: FicheOuverte }) {
  const documents = [
    {
      genre: 'lettre',
      libelle: 'Lettre de motivation',
      chemin: fiche.lettre_motivation_chemin,
      url: fiche.lettre_motivation_url,
    },
    {
      genre: 'cv-anonyme',
      libelle: 'CV anonyme',
      chemin: fiche.cv_anonyme_chemin,
      url: fiche.cv_anonyme_url,
    },
    { genre: 'cv', libelle: 'CV original', chemin: fiche.cv_chemin, url: fiche.cv_url },
  ];

  return (
    <div className="poste-documents">
      {documents.map(({ genre, libelle, chemin, url }) => {
        if (chemin) {
          return (
            <a
              key={genre}
              className="poste-document"
              href={`/espace/referent/candidats/${fiche.id}/document/${genre}`}
            >
              <span className="poste-document-type">PDF</span>
              <span>{libelle}</span>
            </a>
          );
        }

        if (url) {
          return (
            <div
              key={genre}
              className="poste-document poste-document--absent"
              title="Pas encore rapatrié depuis Bubble"
            >
              <span className="poste-document-type">PDF</span>
              <span>{libelle}</span>
              <small>chez Bubble</small>
            </div>
          );
        }

        return (
          <div key={genre} className="poste-document poste-document--absent">
            <span className="poste-document-type">—</span>
            <span>{libelle}</span>
            <small>non fourni</small>
          </div>
        );
      })}

      {/* La quatrième carte de la maquette. Elle ne vient d'aucune colonne :
          l'affichette est un document à produire, pas à stocker. Elle reste
          ici, éteinte, à sa place définitive. */}
      <div className="poste-document poste-document--absent" title="À venir au lot 4">
        <span className="poste-document-type">—</span>
        <span>Affichette</span>
        <small>à venir</small>
      </div>
    </div>
  );
}
