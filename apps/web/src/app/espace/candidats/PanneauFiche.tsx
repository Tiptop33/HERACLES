import Link from 'next/link';
import BoutonImprimer from '@/components/BoutonImprimer';
import LigneDeSuivi from '@/components/LigneDeSuivi';
import { Stylo } from '@/components/Icones';
import { DrapeauFrance } from '../referents/DrapeauFrance';
import { dateEnLettres, enEtiquettes, initiales, telephone } from '@/lib/format';
import {
  A_FAIRE,
  NATURES,
  phraseDeRefus,
  resumeDuJournal,
  type LigneDeJournal,
} from '@/lib/journal';
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
  { valeur: 'suivi', libelle: 'Suivi' },
  { valeur: 'offres', libelle: 'Offres proposées', lot: 'lot 4' },
] as const;

export type Onglet = (typeof ONGLETS)[number]['valeur'];

/** Seuls les onglets construits s'ouvrent : les autres restent éteints. */
export function estOnglet(valeur: unknown): valeur is Onglet {
  return valeur === 'profil' || valeur === 'documents' || valeur === 'suivi';
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
  journal,
  refus,
  corrige,
  adresse,
}: {
  fiche: FicheOuverte;
  /** La ligne correspondante de la liste, quand la vue courante la contient. */
  rang: LigneCandidat | null;
  onglet: Onglet;
  /** Le journal, chargé seulement quand l'onglet « Suivi » est ouvert. */
  journal: LigneDeJournal[];
  /** Ce que la route d'écriture a répondu, quand elle a refusé. */
  refus: string | null;
  /** La note ouverte en correction, portée par l'adresse. */
  corrige: string | null;
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
        {onglet === 'documents' ? (
          <Documents fiche={fiche} />
        ) : onglet === 'suivi' ? (
          <Suivi
            fiche={fiche}
            journal={journal}
            refus={refus}
            corrige={corrige}
            adresse={adresse}
            retour={adresse({ onglet: 'suivi' })}
          />
        ) : (
          <Profil fiche={fiche} />
        )}
      </div>
    </>
  );
}

/**
 * Le journal : ce qui s'est passé, daté. On écrit en haut, on lit en dessous,
 * du plus récent au plus ancien — l'ordre dans lequel on reprend un dossier.
 *
 * Le formulaire est un vrai `form` en `post` : la note part sans une ligne de
 * script, et la route renvoie ici. C'est ce qui compte pour un champ qu'on
 * remplit vingt fois par semaine sur un téléphone dans un couloir.
 */
function Suivi({
  fiche,
  journal,
  refus,
  corrige,
  adresse,
  retour,
}: {
  fiche: FicheOuverte;
  journal: LigneDeJournal[];
  refus: string | null;
  corrige: string | null;
  adresse: (ajout: Record<string, string | null>) => string;
  /** Où revenir après avoir écrit, corrigé ou retiré : cette fiche, cet onglet. */
  retour: string;
}) {
  return (
    <div className="journal">
      {refus && (
        <p className="erreur" role="alert">
          {phraseDeRefus(refus)}
        </p>
      )}

      {/* Ce que porte le dossier avant même de le lire : combien de notes, et
          combien de tâches restent ouvertes. Les secondes viennent de Bubble
          (migration 0023) et sont, pour beaucoup de dossiers, tout ce qu'il y a. */}
      {journal.length > 0 && <p className="maigre">{resumeDuJournal(journal)}</p>}

      {fiche.modifiable ? (
        <form className="journal-ecrire" method="post" action={`/api/candidats/${fiche.id}/suivi`}>
          <textarea
            name="texte"
            required
            maxLength={4000}
            rows={2}
            placeholder="Ce qui s’est passé…"
            aria-label="Ce qui s’est passé"
          />

          <div className="journal-ecrire-pied">
            {/* Une liste ouverte : elle propose sans imposer. Le champ reste
                libre, et ce qui s'y écrira dira un jour ce que doit contenir
                le référentiel. */}
            <input
              name="nature"
              list="natures-du-suivi"
              maxLength={120}
              placeholder="Appel, entretien…"
              aria-label="Nature"
              className="journal-nature"
            />
            <datalist id="natures-du-suivi">
              {NATURES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            {/* Vide, c'est aujourd'hui : on antidate quand on note le lundi
                l'appel du vendredi. */}
            <input
              type="date"
              name="fait_le"
              aria-label="Le jour où c’est arrivé"
              className="journal-date"
            />

            {/* Deux boutons, un seul formulaire. « Noter » vient en premier :
                c'est lui que la touche Entrée déclenche, et le geste courant
                est de consigner ce qui a eu lieu. « À faire » pose l'état, et
                ne l'envoie que si c'est lui qu'on a pressé. */}
            <button className="bouton bouton--fort" type="submit">
              Ajouter
            </button>
            <button className="bouton" type="submit" name="etat" value={A_FAIRE}>
              À faire
            </button>
          </div>
        </form>
      ) : (
        <p className="aide">
          Vous lisez le journal de ce candidat parce qu’il est de votre loge. Seuls son
          référent et son parrain y écrivent.
        </p>
      )}

      {journal.length === 0 ? (
        <p className="poste-fiche-vide">
          Rien de noté pour l’instant
          {fiche.modifiable ? ' — la première note ouvre le dossier.' : '.'}
        </p>
      ) : (
        <ol className="journal-lignes">
          {journal.map((ligne) => (
            <LigneDeSuivi
              key={ligne.id}
              ligne={ligne}
              retour={retour}
              enCorrection={ligne.id === corrige}
              versCorrection={adresse({ note: ligne.id })}
              versLecture={adresse({ note: null })}
            />
          ))}
        </ol>
      )}
    </div>
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
          {/* Deux lignes pour deux colonnes : un dossier peut être archivé
              sans être clôturé, et l'inverse. N'en montrer qu'une ferait dire
              « non clôturé » à une fiche que la liste range dans l'archive. */}
          <dt>Clôture</dt>
          <Valeur absent="non clôturé">{fiche.cloture}</Valeur>
          <dt>Archive</dt>
          <Valeur absent="non archivé">{fiche.archive}</Valeur>
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
          {/* Le taux de remplissage était une étiquette de l'en-tête : cinq
              étiquettes passaient à la ligne, et celle-ci était la moins utile
              des cinq pour savoir de qui l'on parle. Elle dit où le travail
              reste à faire — sa place est dans l'historique de la fiche. */}
          <dt>Renseignée</dt>
          <Valeur>
            <div className="jauge">
              <div className="jauge-piste">
                <div className="jauge-part" style={{ width: `${fiche.remplissage}%` }} />
              </div>
              <span>{fiche.remplissage}&nbsp;%</span>
            </div>
          </Valeur>
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
