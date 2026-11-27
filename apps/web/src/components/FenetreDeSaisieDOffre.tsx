'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import ChoixDesSecteursDuCandidat from '@/components/ChoixDesSecteursDuCandidat';
import { nomDuDepartement } from '@/lib/offres';
import {
  CONTRATS,
  FICHE_VIDE,
  FicheDOffre,
  NOM_DU_TYPE,
  TYPES_D_OFFRE,
  champEnCause,
  demandeDeLaFiche,
  departementDuCodePostal,
  dureeAUnSens,
  premiereErreurDeLaFiche,
  type ValeursDeLaFiche,
} from '@/lib/offres-saisies';

/**
 * La fenêtre « Nouvelle offre » — proposition A de la planche, retenue le 27
 * novembre 2026 (docs/maquettes/saisie-d-une-offre-propositions.html) : une
 * fenêtre flottante, une seule colonne, du plus important au facultatif.
 *
 * Flottante et non modale, comme « Nouveau candidat » : la liste reste lisible
 * et cliquable dessous, la fenêtre se déplace par sa barre de titre — à la
 * souris comme au doigt — et se referme par la croix ou Échap. Un seul bouton,
 * « Publier l'offre » ; pas d'« Annuler ».
 *
 * Le contrat n'apparaît que pour un emploi ; la durée, que lorsqu'elle a un
 * sens (stage, alternance, CDD, intérim). Le secteur est requis : la page des
 * candidats trie les offres par secteur.
 *
 * La même fenêtre modifie une offre déjà saisie (`offre`) : elle s'ouvre
 * remplie, et « Enregistrer » remplace toute la fiche.
 *
 * Le schéma de la fiche contrôle avant l'envoi ; la route contrôle de nouveau,
 * puis la base, qui seule dit qui a le droit.
 *
 * Rendue au bout de la page (`createPortal`) : ouverte depuis l'en-tête d'un
 * bloc ou depuis le détail d'une offre, elle n'hérite d'aucun de leurs styles.
 */

type Position = { x: number; y: number };

/** Largeur de la fenêtre : celle du CSS, pour la poser à l'ouverture. */
const LARGEUR = 460;
/** L'écart minimal avec les bords de l'écran. */
const MARGE = 16;

/**
 * La position, ramenée dans l'écran. La fenêtre peut être plus haute que
 * l'écran — elle défile — : on garde au moins sa barre de titre en vue.
 */
function bornee(p: Position, largeur: number, hauteur: number): Position {
  const maxX = Math.max(MARGE, window.innerWidth - largeur - MARGE);
  const maxY = Math.max(MARGE, window.innerHeight - Math.min(hauteur, 160) - MARGE);
  return { x: Math.min(Math.max(MARGE, p.x), maxX), y: Math.min(Math.max(MARGE, p.y), maxY) };
}

export default function FenetreDeSaisieDOffre({
  offre,
  initiale = FICHE_VIDE,
  fermer,
}: {
  /** L'offre à modifier ; absente, c'est une nouvelle offre. */
  offre?: string;
  initiale?: ValeursDeLaFiche;
  /** Refermer la fenêtre — la croix, Échap, ou une modification enregistrée. */
  fermer: () => void;
}) {
  const router = useRouter();
  const [valeurs, setValeurs] = useState<ValeursDeLaFiche>(initiale);
  const [erreur, setErreur] = useState<{ champ: string | null; message: string } | null>(null);
  const [publiee, setPubliee] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Le choix des secteurs garde son propre état : on le remonte, vide, après
  // une publication.
  const [tour, setTour] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const fenetre = useRef<HTMLDivElement>(null);
  const premierBouton = useRef<HTMLButtonElement>(null);
  const prise = useRef<Position | null>(null);

  const modification = Boolean(offre);
  const titre = modification ? 'Modifier l’offre' : 'Nouvelle offre';
  const idTitre = modification ? `fenetre-modifier-offre-${offre}` : 'fenetre-nouvelle-offre';

  const dimensions = () => {
    const r = fenetre.current?.getBoundingClientRect();
    return { largeur: r?.width ?? LARGEUR, hauteur: r?.height ?? 400 };
  };

  // À l'ouverture, le CSS la pose à droite, sous la barre du haut — là où
  // s'ouvre aussi le détail d'une offre ; elle ne prend une position chiffrée
  // qu'au premier déplacement. Le focus va au premier type.
  useEffect(() => {
    premierBouton.current?.focus();
  }, []);

  // Une fenêtre du navigateur qui rétrécit ne laisse pas la nôtre hors champ.
  useEffect(() => {
    const recadrer = () => {
      const { largeur, hauteur } = dimensions();
      setPosition((p) => (p ? bornee(p, largeur, hauteur) : p));
    };
    window.addEventListener('resize', recadrer);
    return () => window.removeEventListener('resize', recadrer);
  }, []);

  const refermer = useCallback(() => {
    if (!envoi) fermer();
  }, [envoi, fermer]);

  // Le glisser, par la barre de titre. Pointer Events : souris, stylet, doigt.
  function saisir(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const boite = fenetre.current?.getBoundingClientRect();
    if (!boite) return;
    prise.current = { x: e.clientX - boite.left, y: e.clientY - boite.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function glisser(e: React.PointerEvent<HTMLDivElement>) {
    if (!prise.current) return;
    const { largeur, hauteur } = dimensions();
    setPosition(bornee({ x: e.clientX - prise.current.x, y: e.clientY - prise.current.y }, largeur, hauteur));
  }
  function lacher(e: React.PointerEvent<HTMLDivElement>) {
    prise.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  /** Changer un champ : le message d'erreur et l'annonce de publication s'effacent. */
  function poser<K extends keyof ValeursDeLaFiche>(champ: K, valeur: ValeursDeLaFiche[K]) {
    setValeurs((v) => ({ ...v, [champ]: valeur }));
    setErreur(null);
    setPubliee(false);
  }

  async function publier(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    if (envoi) return;
    setErreur(null);
    setPubliee(false);

    const lu = FicheDOffre.safeParse(demandeDeLaFiche(valeurs));
    if (!lu.success) {
      setErreur({ champ: champEnCause(lu.error), message: premiereErreurDeLaFiche(lu.error) });
      return;
    }

    setEnvoi(true);
    try {
      const reponse = await fetch(modification ? `/api/offres/saisies/${offre}` : '/api/offres/saisies', {
        method: modification ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demandeDeLaFiche(valeurs)),
      });
      const resultat = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setErreur({ champ: null, message: resultat.erreur ?? 'L’offre n’a pas pu être enregistrée. Réessayez.' });
        return;
      }
      router.refresh();
      if (modification) {
        fermer();
        return;
      }
      // Une offre publiée : la fiche se vide pour la suivante, la liste
      // dessous s'est mise à jour.
      setValeurs(FICHE_VIDE);
      setTour((t) => t + 1);
      setPubliee(true);
      premierBouton.current?.focus();
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  const invalide = (champ: string) => (erreur?.champ === champ ? true : undefined);
  const departement = departementDuCodePostal(valeurs.code_postal);
  const avecDuree = dureeAUnSens(valeurs.type_offre, valeurs.contrat);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={fenetre}
      className="flottante fenetre-saisie-offre"
      role="dialog"
      aria-labelledby={idTitre}
      style={position ? { left: position.x, top: position.y, right: 'auto' } : undefined}
      onKeyDown={(e) => {
        // Échap referme celle-ci seulement — pas le détail de l'offre dessous.
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          refermer();
        }
      }}
    >
      <div
        className="flottante-barre fenetre-offre-barre"
        onPointerDown={saisir}
        onPointerMove={glisser}
        onPointerUp={lacher}
        onPointerCancel={lacher}
      >
        <h2 id={idTitre}>{titre}</h2>
        <button type="button" className="fenetre-offre-fermer" aria-label="Fermer" onClick={refermer}>
          ✕
        </button>
      </div>

      <form className="flottante-corps saisie-offre" onSubmit={publier} noValidate>
        <div className="champ" role="group" aria-labelledby={`${idTitre}-type`}>
          <span id={`${idTitre}-type`}>Type d’offre</span>
          <div className="types-d-offre">
            {TYPES_D_OFFRE.map((t, i) => (
              <button
                key={t}
                ref={i === 0 ? premierBouton : undefined}
                type="button"
                className={`type-d-offre type-d-offre--${t}`}
                aria-pressed={valeurs.type_offre === t}
                aria-describedby={invalide('type_offre') ? `${idTitre}-erreur` : undefined}
                onClick={() => poser('type_offre', t)}
              >
                {NOM_DU_TYPE[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="champ">
          <label htmlFor={`${idTitre}-intitule`}>Intitulé du poste</label>
          <input
            id={`${idTitre}-intitule`}
            value={valeurs.intitule}
            onChange={(e) => poser('intitule', e.target.value)}
            maxLength={200}
            placeholder="Ex. : Assistant de gestion"
            aria-invalid={invalide('intitule')}
          />
        </div>

        <div className="champ">
          <label htmlFor={`${idTitre}-entreprise`}>Entreprise</label>
          <input
            id={`${idTitre}-entreprise`}
            value={valeurs.entreprise}
            onChange={(e) => poser('entreprise', e.target.value)}
            maxLength={200}
            aria-invalid={invalide('entreprise')}
          />
        </div>

        <div className="saisie-offre-lieu">
          <div className="champ">
            <label htmlFor={`${idTitre}-cp`}>Code postal</label>
            <input
              id={`${idTitre}-cp`}
              value={valeurs.code_postal}
              onChange={(e) => poser('code_postal', e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              aria-invalid={invalide('code_postal')}
              aria-describedby={`${idTitre}-departement`}
            />
          </div>
          <div className="champ">
            <label htmlFor={`${idTitre}-ville`}>Ville</label>
            <input
              id={`${idTitre}-ville`}
              value={valeurs.ville}
              onChange={(e) => poser('ville', e.target.value)}
              maxLength={100}
              aria-invalid={invalide('ville')}
            />
          </div>
          <p className="aide" id={`${idTitre}-departement`}>
            {departement
              ? `Département ${nomDuDepartement(departement)} : l’offre suivra le filtre de ce département.`
              : valeurs.code_postal.trim()
                ? 'Le code postal compte cinq chiffres.'
                : 'Le département se déduit du code postal.'}
          </p>
        </div>

        {valeurs.type_offre === 'emploi' && (
          <div className="champ" role="group" aria-labelledby={`${idTitre}-contrat`}>
            <span id={`${idTitre}-contrat`}>
              Contrat <i className="facultatif">facultatif</i>
            </span>
            <div className="puces-de-contrat">
              {CONTRATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="filtre"
                  aria-pressed={valeurs.contrat === c}
                  // Toucher le contrat choisi le retire : il est facultatif.
                  onClick={() => poser('contrat', valeurs.contrat === c ? null : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {avecDuree && (
          <div className="champ">
            <label htmlFor={`${idTitre}-duree`}>
              Durée <i className="facultatif">facultatif</i>
            </label>
            <input
              id={`${idTitre}-duree`}
              value={valeurs.duree}
              onChange={(e) => poser('duree', e.target.value)}
              maxLength={60}
              placeholder="Ex. : 6 mois"
              aria-invalid={invalide('duree')}
            />
          </div>
        )}

        <div className={`champ${invalide('secteur') ? ' champ--invalide' : ''}`}>
          <span id={`${idTitre}-secteur`}>Secteur d’activité</span>
          <ChoixDesSecteursDuCandidat
            key={tour}
            mode="offre"
            initiale={valeurs.secteur ? [valeurs.secteur] : []}
            idDuTitre={`${idTitre}-secteur`}
            adresses={{ recherche: '/api/secteurs/recherche', liste: '/api/secteurs/liste' }}
            quandChange={(choisis) => {
              const s = choisis[0];
              poser(
                'secteur',
                s ? { code: s.code, intitule: s.intitule, niveau: s.niveau, section: s.section, section_intitule: s.section_intitule } : null,
              );
            }}
          />
        </div>

        <div className="champ">
          <label htmlFor={`${idTitre}-description`}>
            Description <i className="facultatif">facultatif</i>
          </label>
          <textarea
            id={`${idTitre}-description`}
            value={valeurs.description}
            onChange={(e) => poser('description', e.target.value)}
            rows={4}
            maxLength={10000}
            aria-invalid={invalide('description')}
          />
        </div>

        <div className="champ">
          <label htmlFor={`${idTitre}-lien`}>
            Lien de l’annonce <i className="facultatif">facultatif</i>
          </label>
          <input
            id={`${idTitre}-lien`}
            type="url"
            value={valeurs.lien}
            onChange={(e) => poser('lien', e.target.value)}
            placeholder="https://…"
            maxLength={2000}
            aria-invalid={invalide('lien')}
          />
        </div>

        <div className="champ">
          <label htmlFor={`${idTitre}-contact`}>
            Contact <i className="facultatif">facultatif</i>
          </label>
          <input
            id={`${idTitre}-contact`}
            value={valeurs.contact}
            onChange={(e) => poser('contact', e.target.value)}
            placeholder="Nom, e-mail ou téléphone"
            maxLength={300}
            autoComplete="off"
            aria-invalid={invalide('contact')}
          />
        </div>

        {erreur && (
          <p className="erreur" role="alert" id={`${idTitre}-erreur`}>
            {erreur.message}
          </p>
        )}
        {publiee && (
          <p className="encart" role="status">
            Offre publiée : elle s’affiche en tête de la liste, et sur la page des candidats de son secteur.
          </p>
        )}

        <div className="saisie-offre-pied">
          <span className="aide">
            Requis : le type, l’intitulé, l’entreprise, le lieu et le secteur.
          </span>
          <button type="submit" className="bouton bouton--fort" disabled={envoi}>
            {envoi ? 'Envoi…' : modification ? 'Enregistrer' : 'Publier l’offre'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
