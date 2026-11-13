'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { casesARemplir, type ChampLu, type Extrait } from '@/lib/lecture-cv';
import {
  MOBILITES,
  OUI_NON,
  SITUATIONS_FAMILIALES,
  TYPES_DE_RECHERCHE,
  estUnStage,
} from '@/lib/parrainage';
import ChoixDesSecteursDuCandidat from '@/components/ChoixDesSecteursDuCandidat';

/**
 * La fiche que le candidat remplit lui-même — `renseignement_candidat` chez
 * Bubble, d'une seule page plutôt qu'en quatre étapes : on la relit d'un coup
 * d'œil avant d'envoyer, et rien ne se perd en revenant en arrière.
 *
 * `multipart/form-data`, avec ou sans script : le CV part avec le reste. Avec
 * le script, la réponse s'affiche sur place et rien de ce qui a été tapé ne se
 * perd en cas d'erreur.
 */

type Erreur = { champ: string | null; message: string };

/** Où en est la lecture du CV. */
type Lecture =
  | { etat: 'attente' }
  | { etat: 'en_cours' }
  | { etat: 'faite'; remplis: number }
  | { etat: 'echec'; message: string };

/** La photo trouvée dans le CV, telle que la route de lecture la rend. */
type PhotoLue = { type: 'image/jpeg' | 'image/png'; base64: string };

/** La photo gardée : le fichier qui partira avec la fiche, et son aperçu. */
type Photo = { fichier: File; apercu: string };

const ACCEPTES =
  '.pdf,.doc,.docx,.odt,.rtf,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,image/jpeg,image/png,image/webp';

export default function FormulaireCandidature({
  jeton,
  initial,
  lectureDisponible = false,
}: {
  jeton: string;
  initial: { prenom: string; nom: string; email: string; type_emploi: string };
  /**
   * Vrai quand le serveur sait faire lire un CV (`ANTHROPIC_API_KEY` posée).
   * Sinon, ni le bouton « Remplir » ni la mention d'Anthropic ne s'affichent :
   * un bouton qui échoue à tous les coups n'a rien à faire à l'écran.
   */
  lectureDisponible?: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [type, setType] = useState(initial.type_emploi);
  const [cv, setCv] = useState<File | null>(null);
  const [lecture, setLecture] = useState<Lecture>({ etat: 'attente' });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  // Le numéro de la dernière lecture demandée : si le candidat change de
  // fichier pendant qu'on lit le premier, la réponse du premier est ignorée.
  const derniereLecture = useRef(0);

  /** Un autre fichier : la lecture du précédent, finie ou non, ne compte plus. */
  function choisirLeCv(evenement: React.ChangeEvent<HTMLInputElement>) {
    derniereLecture.current++;
    setCv(evenement.currentTarget.files?.[0] ?? null);
    setLecture({ etat: 'attente' });
    garderLaPhoto(null);
  }

  /** Garde une photo — ou aucune —, et libère l'aperçu de la précédente. */
  function garderLaPhoto(nouvelle: Photo | null) {
    setPhoto((ancienne) => {
      if (ancienne) URL.revokeObjectURL(ancienne.apercu);
      return nouvelle;
    });
  }

  /**
   * Le candidat a cliqué « Remplir » : son CV part à la lecture, et l'on
   * remplit ce qui est vide. Sans ce clic, le CV n'est que joint à la fiche —
   * c'est ce geste qui vaut accord pour le transmettre à Anthropic.
   */
  async function lireLeCv() {
    const fichier = cv;
    const numero = ++derniereLecture.current;
    if (!fichier) return;

    setLecture({ etat: 'en_cours' });
    const corps = new FormData();
    corps.append('cv', fichier);

    try {
      const reponse = await fetch(`/api/candidature/${jeton}/lecture-cv`, {
        method: 'POST',
        body: corps,
      });
      const resultat = await reponse.json();
      if (numero !== derniereLecture.current) return;

      if (!reponse.ok || !resultat.extrait) {
        setLecture({
          etat: 'echec',
          message: resultat.erreur ?? 'La lecture de votre CV n’a pas abouti.',
        });
        return;
      }

      const remplis = formulaire.current
        ? remplirLesCasesVides(formulaire.current, resultat.extrait as Extrait, type, setType)
        : 0;
      setLecture({ etat: 'faite', remplis });
      garderLaPhoto(resultat.photo ? photoDepuis(resultat.photo as PhotoLue) : null);
    } catch {
      if (numero !== derniereLecture.current) return;
      setLecture({
        etat: 'echec',
        message:
          'La connexion au serveur a échoué. Remplissez le formulaire vous-même : votre CV sera bien joint à votre fiche.',
      });
    }
  }

  async function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    try {
      const reponse = await fetch(`/api/candidature/${jeton}`, {
        method: 'POST',
        // Le corps est un FormData : le navigateur pose lui-même l'en-tête
        // multipart et sa frontière. Celui-ci dit seulement à la route de
        // répondre en JSON plutôt que par une redirection.
        headers: { 'x-requested-with': 'fetch' },
        body: corpsDeLaFiche(evenement.currentTarget, photo),
      });
      const resultat = await reponse.json();

      if (!reponse.ok) {
        setErreur({ champ: resultat.champ ?? null, message: resultat.erreur ?? 'L’envoi a échoué.' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      router.push('/merci?pour=candidat');
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  const champ = (nom: string) => ({
    id: `c-${nom}`,
    name: nom,
    'aria-invalid': erreur?.champ === nom ? true : undefined,
  });

  return (
    <form
      ref={formulaire}
      className="formulaire-public"
      onSubmit={soumettre}
      method="post"
      action={`/api/candidature/${jeton}`}
      encType="multipart/form-data"
      noValidate
    >
      {erreur && (
        <p className="erreur" role="alert">
          {erreur.message}
        </p>
      )}

      <fieldset>
        <legend data-aide="candidature-cv">Votre CV</legend>
        <div className="champ">
          <label htmlFor="c-cv">CV</label>
          <input {...champ('cv')} type="file" accept={ACCEPTES} onChange={choisirLeCv} />
        </div>
        <p className="aide">
          PDF, Word, OpenDocument, RTF ou photo (JPEG, PNG, WebP), 10 Mo au plus.
        </p>
        {lectureDisponible && (
          <>
            <button
              type="button"
              className="bouton"
              data-aide="candidature-lecture"
              onClick={lireLeCv}
              disabled={!cv || lecture.etat === 'en_cours'}
            >
              Remplir le formulaire à partir de mon CV
            </button>
            <p className="aide">
              Si vous cliquez sur ce bouton, votre CV est transmis à Claude, le service
              d’intelligence artificielle de la société Anthropic (États-Unis), qui le lit pour
              remplir le formulaire à votre place : vous n’avez plus qu’à relire et compléter. Sinon,
              votre CV est seulement joint à votre fiche.
            </p>
            <p className="aide" role="status" aria-live="polite">
              {lecture.etat === 'en_cours' && 'Lecture de votre CV…'}
              {lecture.etat === 'faite' &&
                (lecture.remplis > 0
                  ? `${lecture.remplis} ${lecture.remplis > 1 ? 'champs remplis' : 'champ rempli'} à partir de votre CV. Relisez-les, complétez ce qui manque, puis envoyez.`
                  : 'Votre CV n’a rien apporté de plus : remplissez les champs restés vides.')}
              {lecture.etat === 'echec' && lecture.message}
            </p>
            {photo && (
              <div className="photo-lue">
                {/* Un aperçu local (blob:) : next/image n'a rien à optimiser ici. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.apercu} alt="Votre photo, trouvée dans votre CV" />
                <div>
                  <p className="aide">Photo trouvée dans votre CV : elle accompagnera votre fiche.</p>
                  <button type="button" className="lien-nu" onClick={() => garderLaPhoto(null)}>
                    Ne pas garder cette photo
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </fieldset>

      <fieldset>
        <legend data-aide="candidature-vous">Vous</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="c-prenom">Prénom *</label>
            <input {...champ('prenom')} defaultValue={initial.prenom} autoComplete="given-name" required />
          </div>
          <div className="champ">
            <label htmlFor="c-nom">Nom *</label>
            <input {...champ('nom')} defaultValue={initial.nom} autoComplete="family-name" required />
          </div>
          <div className="champ">
            <label htmlFor="c-email">E-mail *</label>
            <input {...champ('email')} type="email" defaultValue={initial.email} autoComplete="email" required />
          </div>
          <div className="champ">
            <label htmlFor="c-telephone">Téléphone *</label>
            <input {...champ('telephone')} type="tel" autoComplete="tel" required />
          </div>
          <div className="champ">
            <label htmlFor="c-age">Âge</label>
            <input {...champ('age')} type="number" inputMode="numeric" min={14} max={99} />
          </div>
          <div className="champ">
            <label htmlFor="c-situation_familiale">Situation familiale</label>
            <select {...champ('situation_familiale')} defaultValue="">
              <option value="" disabled>
                Choisir…
              </option>
              {SITUATIONS_FAMILIALES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="champ">
          <label htmlFor="c-adresse">Adresse</label>
          <input {...champ('adresse')} autoComplete="street-address" />
        </div>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="c-code_postal">Code postal</label>
            <input {...champ('code_postal')} inputMode="numeric" autoComplete="postal-code" />
          </div>
          <div className="champ">
            <label htmlFor="c-ville">Ville</label>
            <input {...champ('ville')} autoComplete="address-level2" />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend data-aide="candidature-recherche">Votre recherche</legend>
        <div className="ligne-edition">
          <div className="champ">
            <label htmlFor="c-type_emploi">Type de recherche</label>
            <select
              {...champ('type_emploi')}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="" disabled>
                Choisir…
              </option>
              {TYPES_DE_RECHERCHE.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="c-emploi_recherche">Métier visé</label>
            <input {...champ('emploi_recherche')} />
          </div>
          <div className="champ">
            <label htmlFor="c-mobilite_geographique">Mobilité géographique</label>
            <select {...champ('mobilite_geographique')} defaultValue="">
              <option value="" disabled>
                Choisir…
              </option>
              {MOBILITES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Les secteurs d'activité (maquette validée le 12 novembre 2026,
            docs/maquettes/secteurs-d-activite.html, écran 1) : jusqu'à
            trois, le premier est le principal. Ils partent avec la fiche,
            dans un champ caché ; le référent les confirmera. */}
        <div className="champ">
          <span id="c-titre-secteurs">Secteurs d’activité</span>
          <ChoixDesSecteursDuCandidat
            mode="candidat"
            initiale={[]}
            nomDuChamp="secteurs"
            idDuTitre="c-titre-secteurs"
            adresses={{
              recherche: `/api/candidature/${jeton}/secteurs`,
              liste: `/api/candidature/${jeton}/secteurs/liste`,
            }}
          />
        </div>

        {/* Les dates ne concernent qu'un stage. Sans script, elles restent
            affichées : mieux vaut un champ de trop qu'une date impossible à
            donner. */}
        {(estUnStage(type) || !type) && (
          <div className="ligne-edition">
            <div className="champ">
              <label htmlFor="c-debut_stage">Début du stage</label>
              <input {...champ('debut_stage')} type="date" />
            </div>
            <div className="champ">
              <label htmlFor="c-fin_stage">Fin du stage</label>
              <input {...champ('fin_stage')} type="date" />
            </div>
          </div>
        )}

        <div className="champ">
          <label htmlFor="c-definition_emploi">Définition très précise de l’emploi recherché</label>
          <textarea
            {...champ('definition_emploi')}
            rows={3}
            placeholder="RESPONSABLE D’AGENCE ; CADRE ; …"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend data-aide="candidature-permis">Permis et véhicule</legend>
        <div className="ligne-edition">
          {(
            [
              ['permis_vl', 'Permis B (voiture)'],
              ['permis_moto', 'Permis moto'],
              ['permis_pl', 'Permis poids lourd'],
              ['vehicule', 'Véhicule'],
            ] as const
          ).map(([nom, libelle]) => (
            <div className="champ" key={nom}>
              <label htmlFor={`c-${nom}`}>{libelle}</label>
              <select {...champ(nom)} defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                {OUI_NON.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend data-aide="candidature-parcours">Votre parcours</legend>
        {(
          [
            ['formations', 'Formation'],
            ['experiences', 'Expériences'],
            ['competences', 'Compétences'],
            ['informatique', 'Informatique'],
            ['savoir_etre', 'Savoir-être'],
            ['centres_interet', 'Centres d’intérêt'],
          ] as const
        ).map(([nom, libelle]) => (
          <div className="champ" key={nom}>
            <label htmlFor={`c-${nom}`}>{libelle}</label>
            <textarea {...champ(nom)} rows={nom === 'experiences' ? 5 : 3} />
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend data-aide="candidature-documents">Vos documents</legend>
        <div className="champ">
          <label htmlFor="c-lettre">Lettre de motivation</label>
          <input {...champ('lettre')} type="file" accept={ACCEPTES} />
        </div>
        <p className="aide">PDF, Word, OpenDocument, RTF ou photo (JPEG, PNG, WebP), 10 Mo au plus.</p>
      </fieldset>

      <label
        className="consentement"
        aria-invalid={erreur?.champ === 'consentement' || undefined}
        data-aide="candidature-consentement"
      >
        <input type="checkbox" name="consentement" value="oui" required />
        <span>
          J’accepte que la commission conserve ces informations et mes documents pour m’accompagner
          dans ma recherche. Ils ne sont lus que par les membres de la commission de la loge, ne
          sont jamais publiés, et je peux demander leur suppression.
          {lectureDisponible &&
            ' Si j’ai demandé à remplir ce formulaire à partir de mon CV, celui-ci a aussi été transmis à Anthropic pour être lu par Claude.'}
        </span>
      </label>

      <button
        type="submit"
        className="bouton bouton--marque bouton--pleine-largeur"
        disabled={envoi}
        data-aide="candidature-envoyer"
      >
        {envoi ? 'Envoi…' : 'Envoyer ma fiche'}
      </button>
    </form>
  );
}

/**
 * Remplit, dans le formulaire, les cases que la lecture du CV a trouvées et
 * que le candidat a laissées vides. Rend le nombre de cases remplies.
 *
 * Les cases sont libres (`defaultValue`) : on écrit leur valeur directement.
 * Seul le type de recherche est tenu par React, puisqu'il décide d'afficher
 * les dates de stage : il passe par son état.
 */
function remplirLesCasesVides(
  formulaire: HTMLFormElement,
  extrait: Extrait,
  type: string,
  setType: (valeur: string) => void,
): number {
  const caseDe = (nom: string) => {
    const element = formulaire.elements.namedItem(nom);
    return element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
      ? element
      : null;
  };

  const actuelles: Partial<Record<ChampLu, string>> = {};
  for (const nom of Object.keys(extrait) as ChampLu[]) {
    actuelles[nom] = nom === 'type_emploi' ? type : caseDe(nom)?.value;
  }

  const aRemplir = casesARemplir(actuelles, extrait);
  for (const [nom, valeur] of Object.entries(aRemplir)) {
    if (nom === 'type_emploi') {
      setType(valeur);
      continue;
    }
    const element = caseDe(nom);
    if (element) element.value = valeur;
  }
  return Object.keys(aRemplir).length;
}

/** La photo rendue par la lecture, en fichier prêt à partir et en aperçu. */
function photoDepuis(lue: PhotoLue): Photo {
  const octets = Uint8Array.from(atob(lue.base64), (c) => c.charCodeAt(0));
  const extension = lue.type === 'image/png' ? 'png' : 'jpg';
  const fichier = new File([octets], `photo.${extension}`, { type: lue.type });
  return { fichier, apercu: URL.createObjectURL(fichier) };
}

/** Les champs du formulaire, et la photo gardée s'il y en a une. */
function corpsDeLaFiche(formulaire: HTMLFormElement, photo: Photo | null): FormData {
  const corps = new FormData(formulaire);
  if (photo) corps.append('photo', photo.fichier);
  return corps;
}
