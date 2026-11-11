import Link from 'next/link';
import BoutonImprimer from '@/components/BoutonImprimer';
import LigneDeSuivi from '@/components/LigneDeSuivi';
import { Feuille, FeuilleVide, Stylo } from '@/components/Icones';
import { DrapeauFrance } from '../referents/DrapeauFrance';
import MenuDuReferent from './MenuDuReferent';
import { dateEnLettres, enEtiquettes, initiales, telephone } from '@/lib/format';
import {
  A_FAIRE,
  NATURES,
  phraseDeRefus,
  resumeDuJournal,
  type LigneDeJournal,
  type LigneRetiree,
} from '@/lib/journal';
import { libelleDeRecherche } from '@/lib/parrainage';
import { nomDeFamilleDabord, type FicheOuverte, type LigneCandidat } from '@/lib/poste';
import { carteDuCvAnonyme } from '@/lib/documents/carte-cv-anonyme';
import type { EtatDuCvAnonyme } from '@/lib/documents/donnees';
import { jourEntier } from '@/lib/documents/formats';

/** Un référent de la loge, à qui confier une nouvelle demande. */
export type Collegue = { id: string; nom: string; c_est_moi: boolean };

/** Ce que la route de prise en charge a répondu, quand elle a refusé. */
const REFUS_DE_PRISE: Record<string, string> = {
  'sans-loge': 'Votre compte n’est rattaché à aucune loge.',
  referent: 'Ce référent n’est pas de la loge du candidat.',
  introuvable: 'Ce candidat est accompagné par quelqu’un d’autre, ou n’est pas de votre loge.',
  session: 'Votre session a expiré. Reconnectez-vous.',
};

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
  retirees,
  jePeuxNoter,
  adresse,
  collegues,
  referentActuel,
  prise,
  cloturable,
  rouvrable,
  cvAnonyme,
  refusCvAnonyme,
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
  /** Ce qui a été écarté du journal, et qu'on peut rendre. */
  retirees: LigneRetiree[];
  /** Le compte a-t-il une fiche de référent ? C'est tout ce qu'écrire demande. */
  jePeuxNoter: boolean;
  adresse: (ajout: Record<string, string | null>) => string;
  /**
   * Les référents de la loge, quand la personne connectée peut choisir le
   * référent de ce candidat — sinon `null`, et le menu n'apparaît pas.
   */
  collegues: Collegue[] | null;
  /** Le référent en place, sur lequel le menu s'ouvre. */
  referentActuel: string | null;
  /** Ce que la route de prise en charge a répondu, quand elle a refusé. */
  prise: string | null;
  /**
   * Le dossier est en cours et la session peut le clôturer (0071) :
   * administration, Vénérable Maître, Secrétaire. Fait paraître le bouton.
   */
  cloturable: boolean;
  /**
   * Le dossier est clôturé, pas archivé, et la session peut le rouvrir (0072).
   * Fait paraître « Rouvrir le dossier » à la place de « Clôturer ».
   */
  rouvrable: boolean;
  /**
   * Le CV anonyme produit par HERACLES (0073), lu sous l'onglet « Documents » :
   * validé ou non, et si c'est à la session de le valider.
   */
  cvAnonyme: EtatDuCvAnonyme | null;
  /** Ce que la validation du CV anonyme a refusé. */
  refusCvAnonyme: string | null;
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
            // 104 et non 52 : la taille rendue a doublé, et ces deux nombres
            // servent à réserver la place avant que l'image arrive. Faux, ils
            // feraient sauter l'en-tête au chargement.
            width={104}
            height={104}
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

        <div className="fiche-actions" data-aide="actions-fiche">
          <BoutonImprimer />

          {/* L'affichette : ce dossier seul, mis en avant pour circuler. Elle
              ne porte ni nom, ni ville, ni CV — seulement le numéro, qui sert
              à revenir vers la commission. */}
          <a
            className="bouton"
            href={`/api/candidats/${fiche.id}/affichette`}
            target="_blank"
            rel="noopener"
          >
            Affichette
          </a>

          {/* Éteint, et à sa place définitive : c'est le geste que la maquette
              met ici, et le lot 4 l'apportera. */}
          <span className="bouton bouton--eteint" title="À venir au lot 4">
            Proposer une offre
          </span>

          {/* Clôturer n'agit pas tout de suite : le bouton ouvre la fenêtre
              où l'on dit qui a refermé le dossier (0071). */}
          {cloturable && (
            <Link
              href={adresse({ cloturer: '1' })}
              scroll={false}
              className="bouton"
              data-aide="cloturer-dossier"
            >
              Clôturer le dossier
            </Link>
          )}

          {/* Sur un dossier clôturé, le même emplacement rouvre : la fenêtre
              dit ce que la réouverture efface avant de le faire (0072). */}
          {rouvrable && (
            <Link
              href={adresse({ rouvrir: '1' })}
              scroll={false}
              className="bouton"
              data-aide="rouvrir-dossier"
            >
              Rouvrir le dossier
            </Link>
          )}

          {/* Le stylo n'apparaît que pour qui accompagne — et s'il apparaissait
              à tort, la base refuserait quand même : c'est elle qui décide,
              pas cette ligne. */}
          {fiche.modifiable && (
            <Link
              href={`/espace/referent/candidats/${fiche.id}/modifier`}
              className="geste geste--corriger"
              data-aide="corriger-fiche"
              aria-label={`Corriger la fiche de ${nom}`}
              title="Corriger cette fiche"
            >
              <Stylo />
            </Link>
          )}
        </div>
      </div>

      <nav className="poste-onglets" aria-label="Parties de la fiche" data-aide="onglets-fiche">
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
              data-aide={`onglet:${o.valeur}`}
            >
              {o.libelle}
            </Link>
          ),
        )}
      </nav>

      <div className="poste-contenu">
        {onglet === 'documents' ? (
          <Documents
            fiche={fiche}
            cvAnonyme={cvAnonyme}
            refusCvAnonyme={refusCvAnonyme}
            retour={adresse({ cvanonyme: null })}
          />
        ) : onglet === 'suivi' ? (
          <Suivi
            fiche={fiche}
            journal={journal}
            refus={refus}
            corrige={corrige}
            retirees={retirees}
            jePeuxNoter={jePeuxNoter}
            adresse={adresse}
            retour={adresse({ onglet: 'suivi' })}
          />
        ) : (
          <Profil
            fiche={fiche}
            collegues={collegues}
            referentActuel={referentActuel}
            prise={prise}
          />
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
  retirees,
  jePeuxNoter,
  adresse,
  retour,
}: {
  fiche: FicheOuverte;
  journal: LigneDeJournal[];
  refus: string | null;
  corrige: string | null;
  retirees: LigneRetiree[];
  jePeuxNoter: boolean;
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

      {jePeuxNoter ? (
        <form
          className="journal-ecrire"
          method="post"
          action={`/api/candidats/${fiche.id}/suivi`}
          data-aide="noter-suivi"
        >
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
          Votre compte n’est rattaché à aucune fiche de référent : vous lisez ce journal,
          vous n’y écrivez pas.
        </p>
      )}

      {journal.length === 0 ? (
        <p className="poste-fiche-vide">
          Rien de noté pour l’instant
          {jePeuxNoter ? ' — la première note ouvre le dossier.' : '.'}
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

      <NotesRetirees retirees={retirees} retour={retour} />
    </div>
  );
}

/**
 * Ce qui a été écarté du journal, et qui peut revenir.
 *
 * C'est ce bloc qui fait la différence entre retirer et effacer. Sans lui, le
 * retrait doux ne serait qu'une suppression avec une colonne en plus : la
 * ligne serait invisible, donc perdue en pratique.
 *
 * Replié par défaut — `<details>`, sans une ligne de script. Ce qu'on a
 * écarté n'a pas à encombrer la lecture courante du dossier ; il faut
 * seulement pouvoir y revenir.
 */
function NotesRetirees({ retirees, retour }: { retirees: LigneRetiree[]; retour: string }) {
  if (retirees.length === 0) return null;

  return (
    <details className="journal-retirees">
      <summary data-aide="notes-retirees">
        {retirees.length} note{retirees.length > 1 ? 's' : ''} retirée
        {retirees.length > 1 ? 's' : ''}
      </summary>

      <ol className="journal-lignes">
        {retirees.map((note) => (
          <li key={note.id} className="journal-ligne">
            <div className="journal-ligne-tete">
              <time dateTime={note.fait_le}>{dateEnLettres(note.fait_le)}</time>
              <span className="journal-auteur">
                {note.auteur_nom ?? 'auteur inconnu'}
                {note.retire_par_nom && ` · retirée par ${note.retire_par_nom}`}
              </span>

              {note.je_peux_agir && (
                <form
                  method="post"
                  action={`/api/suivi/${note.id}/retirer`}
                  className="journal-agir"
                >
                  <input type="hidden" name="geste" value="rendre" />
                  <input type="hidden" name="retour" value={retour} />
                  <button type="submit" title="La note revient dans le journal">
                    Rendre
                  </button>
                </form>
              )}
            </div>
            <p className="prose">{note.texte}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Profil({
  fiche,
  collegues,
  referentActuel,
  prise,
}: {
  fiche: FicheOuverte;
  collegues: Collegue[] | null;
  referentActuel: string | null;
  prise: string | null;
}) {
  const lieu = fiche.ville ?? fiche.adresse;
  const lieuComplet = [lieu, fiche.code_postal ? `(${fiche.code_postal})` : null]
    .filter(Boolean)
    .join(' ');

  const tel = telephone(fiche.telephone);

  // Le menu du référent remplace le nom sur sa propre ligne quand on peut
  // en changer (0063). Il ne paraît que si le référent en place est parmi
  // les choix : sinon le navigateur présélectionnerait le premier de la
  // liste, et un choix confierait le candidat à quelqu'un qu'on n'a pas
  // choisi.
  //
  // Une nouvelle demande, sans référent, porte le même menu, ouvert sur
  // « personne » : un référent de la loge la prend, ou la confie à un
  // collègue (0057). « Moi » vient en tête de liste ; l'administration, qui
  // n'a pas toujours de fiche de référent, ne se le voit proposer que si
  // elle en a une dans cette loge.
  let menuDuReferent: { choix: Collegue[]; referentActuel: string | null } | null = null;
  if (collegues && collegues.length > 0) {
    if (fiche.a_un_referent) {
      if (referentActuel !== null && collegues.some((c) => c.id === referentActuel)) {
        menuDuReferent = { choix: collegues, referentActuel };
      }
    } else {
      const moi = collegues.find((c) => c.c_est_moi);
      menuDuReferent = {
        choix: moi
          ? [{ ...moi, nom: 'Moi' }, ...collegues.filter((c) => !c.c_est_moi)]
          : collegues,
        referentActuel: null,
      };
    }
  }

  const parcours = [fiche.formations, fiche.experiences]
    .map((bloc) => bloc?.trim())
    .filter(Boolean)
    .join('\n\n');

  const etiquettes = [
    ...enEtiquettes(fiche.competences),
    ...enEtiquettes(fiche.savoir_etre),
    ...enEtiquettes(fiche.informatique),
  ];

  // Chaque réponse avec son nom : « Oui · Non » ne dirait pas à quoi.
  const permis = [
    fiche.permis_vl ? `B : ${fiche.permis_vl}` : null,
    fiche.permis_moto ? `moto : ${fiche.permis_moto}` : null,
    fiche.permis_pl ? `poids lourd : ${fiche.permis_pl}` : null,
    fiche.vehicule ? `véhicule : ${fiche.vehicule}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Le bloc « Présentation » n'apparaît que s'il a quelque chose à dire : les
  // fiches reprises de Bubble n'ont pas encore ces champs.
  const presentation =
    fiche.parrain_presentateur ||
    fiche.lien_parente ||
    fiche.connait_appartenance ||
    fiche.peut_se_devoiler ||
    fiche.urgence !== null ||
    fiche.urgence_motif;

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
          <Valeur>{libelleDeRecherche(fiche.type_emploi)}</Valeur>
          <dt>Métier</dt>
          <Valeur>{fiche.emploi_recherche ?? fiche.metier_libelle}</Valeur>
          <dt>Mobilité</dt>
          <Valeur>{fiche.mobilite_geographique}</Valeur>
          <dt>Précisions</dt>
          <Valeur>{fiche.definition_emploi}</Valeur>
          <dt>Disponible</dt>
          <Valeur>{dateEnLettres(fiche.debut_stage)}</Valeur>
          {fiche.fin_stage && (
            <>
              <dt>Jusqu’au</dt>
              <Valeur>{dateEnLettres(fiche.fin_stage)}</Valeur>
            </>
          )}
          <dt>Secteur</dt>
          <Valeur>{fiche.secteur_activite_libelle}</Valeur>
          <dt>Permis</dt>
          <Valeur>{permis}</Valeur>
        </dl>
      </section>

      <section className="bloc" data-aide="referent-du-candidat">
        <h2>Accompagnement</h2>
        <dl className="champs">
          <dt id="intitule-referent">Référent</dt>
          {menuDuReferent ? (
            <dd>
              {/* Le menu à l'écran, le nom sur le papier : un menu
                  déroulant imprimé ne dit rien de plus qu'un nom. */}
              <MenuDuReferent
                action={`/api/candidats/${fiche.id}/referent`}
                collegues={menuDuReferent.choix}
                referentActuel={menuDuReferent.referentActuel}
                intitule="intitule-referent"
              />
              <span className="referent-imprime">{fiche.referent_nom ?? 'personne'}</span>
            </dd>
          ) : (
            <Valeur absent="personne">{fiche.referent_nom}</Valeur>
          )}
          <dt>Parrain</dt>
          <Valeur absent="personne">{fiche.parrain_nom ?? fiche.parrain_presentateur}</Valeur>
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

        {prise && (
          <p className="erreur" role="alert">
            {REFUS_DE_PRISE[prise] ?? 'La prise en charge a échoué.'}
          </p>
        )}

      </section>

      {presentation && (
        <section className="bloc">
          <h2>Présentation</h2>
          <dl className="champs">
            <dt>Par</dt>
            <Valeur>
              {[fiche.parrain_presentateur, fiche.parrain_loge ? `(${fiche.parrain_loge})` : null]
                .filter(Boolean)
                .join(' ') || null}
            </Valeur>
            <dt>Contact</dt>
            <Valeur>
              {[fiche.parrain_telephone, fiche.parrain_email].filter(Boolean).join(' · ') || null}
            </Valeur>
            <dt>Lien</dt>
            <Valeur>{fiche.lien_parente}</Valeur>
            <dt>Connaît l’appartenance</dt>
            <Valeur>{fiche.connait_appartenance}</Valeur>
            <dt>Peut-on se dévoiler</dt>
            <Valeur>{fiche.peut_se_devoiler}</Valeur>
            <dt>Urgence</dt>
            <Valeur>{fiche.urgence !== null ? `${fiche.urgence} / 5` : null}</Valeur>
            <dt>Pourquoi</dt>
            <Valeur>{fiche.urgence_motif}</Valeur>
            <dt>Fiche du candidat</dt>
            <Valeur absent="en attente de sa réponse">
              {fiche.candidature_completee_le
                ? `complétée le ${dateEnLettres(fiche.candidature_completee_le)}`
                : null}
            </Valeur>
          </dl>
        </section>
      )}

      <section className="bloc bloc--large">
        <h2>Parcours</h2>
        {parcours ? (
          <p className="prose">{parcours}</p>
        ) : (
          <p className="prose maigre">
            <em>Ni formation ni expérience renseignée pour l’instant.</em>
          </p>
        )}

        {fiche.centres_interet && (
          <p className="prose" style={{ marginTop: '0.8rem' }}>
            <strong>Centres d’intérêt&nbsp;:</strong> {fiche.centres_interet}
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
 *
 * **Une feuille plutôt que le mot « PDF ».** La maquette écrivait le format,
 * mais la carte l'écrivait au jugé : tout fichier déposé s'annonçait « PDF »,
 * y compris les `.docx` et les `.odt` que la reprise de Bubble ramène. Le
 * dessin ne ment pas — c'est un document, et le nom dit lequel.
 *
 * **Le CV anonyme se fait tout seul** dès qu'il y a un CV original : la carte
 * s'ouvre alors sur celui qu'HERACLES produit de la fiche, marquée « à
 * valider » tant qu'un référent de la loge ne l'a pas relu
 * (`carteDuCvAnonyme()`).
 */
function Documents({
  fiche,
  cvAnonyme,
  refusCvAnonyme,
  retour,
}: {
  fiche: FicheOuverte;
  cvAnonyme: EtatDuCvAnonyme | null;
  refusCvAnonyme: string | null;
  retour: string;
}) {
  const carte = carteDuCvAnonyme(fiche, cvAnonyme?.valide_le);
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
    <>
    <div className="poste-documents">
      {documents.map(({ genre, libelle, chemin, url }) => {
        // Produit par HERACLES : validé, ou à valider dès qu'il y a un CV
        // original. La route sert la copie figée, sinon le produit à la volée.
        if (genre === 'cv-anonyme' && carte.sorte === 'produit') {
          return (
            <a
              key={genre}
              className="poste-document"
              href={`/api/candidats/${fiche.id}/cv-anonyme`}
              target="_blank"
              rel="noopener noreferrer"
              title={
                carte.aValider
                  ? 'Produit par HERACLES depuis la fiche — à relire et valider'
                  : `Ouvrir : ${libelle}`
              }
            >
              <span className="poste-document-type">
                <Feuille />
              </span>
              <span>{libelle}</span>
              {carte.aValider ? <small>à valider</small> : null}
            </a>
          );
        }

        if (chemin) {
          return (
            <a
              key={genre}
              className="poste-document"
              href={`/espace/referent/candidats/${fiche.id}/document/${genre}`}
              title={`Ouvrir : ${libelle}`}
            >
              <span className="poste-document-type">
                <Feuille />
              </span>
              <span>{libelle}</span>
            </a>
          );
        }

        // Chez Bubble, le fichier existe : la feuille reste pleine, et c'est la
        // carte entière qui dit, en pointillé, qu'elle ne s'ouvre pas encore.
        if (url) {
          return (
            <div
              key={genre}
              className="poste-document poste-document--absent"
              title="Pas encore rapatrié depuis Bubble"
            >
              <span className="poste-document-type">
                <Feuille />
              </span>
              <span>{libelle}</span>
              <small>chez Bubble</small>
            </div>
          );
        }

        return (
          <div key={genre} className="poste-document poste-document--absent">
            <span className="poste-document-type">
              <FeuilleVide />
            </span>
            <span>{libelle}</span>
            <small>non fourni</small>
          </div>
        );
      })}

      {/* La quatrième carte de la maquette. Elle ne vient d'aucune colonne :
          l'affichette est un document à produire, pas à stocker. Elle reste
          ici, éteinte, à sa place définitive. */}
      <div className="poste-document poste-document--absent" title="À venir au lot 4">
        <span className="poste-document-type">
          <FeuilleVide />
        </span>
        <span>Affichette</span>
        <small>à venir</small>
      </div>
    </div>

    {cvAnonyme ? (
      <BandeauDuCvAnonyme id={fiche.id} etat={cvAnonyme} refus={refusCvAnonyme} retour={retour} />
    ) : null}
    </>
  );
}

/**
 * Le CV anonyme qu'HERACLES produit de la fiche (migration 0073), sous les
 * cartes : son état — validé par un référent ou par HERACLES (0078), sinon
 * pourquoi HERACLES ne l'a pas validé seul (0079) —, le voir, et — pour tout
 * référent de la loge du candidat (0074) — le valider ou retirer sa
 * validation.
 *
 * Validé, c'est lui que servent le lien de l'affiche et le QR code de
 * l'affichette, dans sa copie figée (0075) ; jusque-là, ils servent le
 * fichier déposé, s'il y en a un. Une fiche modifiée efface la validation :
 * le CV est à relire.
 *
 * Rendu par le serveur, sans script : un formulaire par geste, qui revient
 * sur la fiche.
 */
function BandeauDuCvAnonyme({
  id,
  etat,
  refus,
  retour,
}: {
  id: string;
  etat: EtatDuCvAnonyme;
  refus: string | null;
  retour: string;
}) {
  const valide = Boolean(etat.valide_le);
  return (
    <section className="cv-anonyme-bandeau" aria-labelledby="cv-anonyme-titre">
      <div className="cv-anonyme-etat">
        <strong id="cv-anonyme-titre">CV anonyme produit par HERACLES</strong>
        {valide ? (
          <span className="cv-anonyme-pastille cv-anonyme-pastille--valide">
            Validé le {jourEntier(etat.valide_le)}
            {etat.valide_par ? ` par ${etat.valide_par}` : ''}
          </span>
        ) : (
          <span className="cv-anonyme-pastille">À valider</span>
        )}
      </div>

      {/* Pourquoi HERACLES ne l'a pas validé seul (0079) : quoi corriger, ou
          quoi relire avant de valider à la main. */}
      {!valide && etat.raison ? <p className="cv-anonyme-raison">{etat.raison}</p> : null}

      {refus ? (
        <p className="cv-anonyme-refus" role="alert">
          {refus}
        </p>
      ) : null}

      <div className="cv-anonyme-gestes" data-aide="cv-anonyme">
        <a
          className="bouton bouton--petit"
          href={`/api/candidats/${id}/cv-anonyme`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir le CV anonyme
        </a>
        {etat.peut_valider ? (
          <form method="post" action={`/api/candidats/${id}/cv-anonyme`}>
            <input type="hidden" name="retour" value={retour} />
            <input type="hidden" name="valider" value={valide ? 'non' : 'oui'} />
            <button className={`bouton bouton--petit${valide ? '' : ' bouton--fort'}`} type="submit">
              {valide ? 'Retirer la validation' : 'Valider'}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
