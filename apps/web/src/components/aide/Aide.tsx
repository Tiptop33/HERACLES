'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cheminDe,
  etapeDArrivee,
  parcoursDuRole,
  type Etape,
  type Parcours,
} from '@/lib/aide/parcours';
import { placer, type Boite } from '@/lib/aide/placement';
import { chercherDesParcours } from '@/lib/aide/recherche';
import type { Role } from '@/lib/roles';

/**
 * L'aide de HERACLES : on pose une question, elle montre où ça se passe.
 *
 * Trois pièces, toutes flottantes et non modales — l'écran dessous reste
 * lisible et cliquable du début à la fin :
 *
 * - le **bouton « Aide »**, en bas à droite ;
 * - la **fenêtre d'aide** : la question, et les parcours qui y répondent, avec
 *   « Montre-moi » (pas à pas depuis le début) et « Emmène-moi » (l'écran
 *   s'ouvre, le personnage désigne l'arrivée) ;
 * - le **guide** : le personnage en volume posé à côté de l'élément désigné,
 *   le bras tendu vers lui, et sa bulle.
 *
 * L'aide ne clique jamais à la place de la personne et ne modifie aucune
 * donnée : elle navigue (ce que ferait un lien) et elle désigne.
 *
 * La recherche est locale (`lib/aide/recherche.ts`) : tant qu'elle trouve, la
 * question ne quitte pas le navigateur. Quand elle ne trouve rien, un bouton
 * « Demander à Claude » propose d'envoyer la question au serveur, qui la
 * transmet à Anthropic — sur ce clic seulement, et c'est écrit à côté. Le
 * personnage, et la bibliothèque 3D qu'il tire,
 * ne se chargent qu'à la première visite guidée.
 */

const Personnage = dynamic(() => import('./Personnage'), { ssr: false });

// Les mêmes mesures que la feuille de style et que `Personnage.tsx`.
const GUIDE = { l: 270, h: 260 };
const PERSONNAGE = { l: 120, h: 140 };

/** Le temps laissé à un écran pour s'afficher avant de dire « je ne le vois pas ». */
const PATIENCE_MS = 1200;

type Visite = { parcours: Parcours; index: number };

type Cible = { ancre: string | null; boite: Boite | null; introuvable: boolean };

/**
 * Ce que Claude a répondu, et à quelle question : une réponse ne vaut que
 * pour la question qui l'a demandée — dès qu'on retape, elle s'efface.
 */
type Renfort = {
  question: string;
  etat: 'attente' | 'trouve' | 'rien' | 'echec';
  ids: string[];
  message?: string;
};

const AUCUNE: Cible = { ancre: null, boite: null, introuvable: false };

function selecteur(ancre: string): string {
  return `[data-aide="${ancre.replace(/["\\]/g, '\\$&')}"]`;
}

/** L'élément marqué de cette ancre, s'il est réellement affiché. */
function trouver(ancre: string): Element | null {
  for (const element of document.querySelectorAll(selecteur(ancre))) {
    const r = element.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return element;
  }
  return null;
}

/**
 * Suit l'élément désigné à l'écran : sa place, image après image — il bouge
 * quand on défile, quand la fenêtre change de taille, quand l'écran change.
 * L'état React n'est touché que si quelque chose a bougé.
 */
function useCible(ancre: string | null): Cible {
  const [cible, setCible] = useState<Cible>(AUCUNE);

  useEffect(() => {
    if (!ancre) return;

    const depart = performance.now();
    let image = 0;
    let dejaVu = false;
    let derniere = '';

    const suivre = () => {
      const element = trouver(ancre);
      let boite: Boite | null = null;

      if (element) {
        const r = element.getBoundingClientRect();
        boite = {
          x: Math.round(r.left),
          y: Math.round(r.top),
          l: Math.round(r.width),
          h: Math.round(r.height),
        };

        // À la première apparition seulement, et seulement s'il est hors
        // champ : on ne reprend pas la main sur le défilement ensuite.
        if (!dejaVu) {
          dejaVu = true;
          const horsChamp = r.bottom < 0 || r.top > window.innerHeight;
          if (horsChamp) element.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      }

      const introuvable = !element && performance.now() - depart > PATIENCE_MS;
      const cle = boite ? `${boite.x},${boite.y},${boite.l},${boite.h}` : `rien,${introuvable}`;
      if (cle !== derniere) {
        derniere = cle;
        setCible({ ancre, boite, introuvable });
      }

      image = requestAnimationFrame(suivre);
    };

    image = requestAnimationFrame(suivre);
    return () => cancelAnimationFrame(image);
  }, [ancre]);

  // L'état d'une étape précédente ne vaut rien pour celle-ci.
  return cible.ancre === ancre ? cible : { ...AUCUNE, ancre };
}

/** L'écran où se trouve l'élément d'une étape, quand on le sait. */
function ecranDe(etape: Etape): string | null {
  if (etape.ecran) return etape.ecran;
  // Une entrée du menu mène à sa propre adresse : faute de la voir, on y va.
  if (etape.ancre?.startsWith('menu:')) return etape.ancre.slice('menu:'.length);
  return null;
}

export default function Aide({
  role,
  renfort: renfortOuvert = false,
}: {
  role: Role;
  /** Vrai quand le serveur peut interroger Claude (clé présente). */
  renfort?: boolean;
}) {
  const router = useRouter();
  const chemin = usePathname() ?? '';

  const [ouverte, setOuverte] = useState(false);
  const [question, setQuestion] = useState('');
  const [visite, setVisite] = useState<Visite | null>(null);
  const [reponse, setReponse] = useState<Renfort | null>(null);
  const [ecran, setEcran] = useState({ l: 1280, h: 800 });

  const champ = useRef<HTMLInputElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  const tous = useMemo(() => parcoursDuRole(role), [role]);
  const trouves = useMemo(() => chercherDesParcours(question, tous), [question, tous]);
  const sansReponse = question.trim() !== '' && trouves.length === 0;

  // La réponse de Claude, si elle porte sur la question affichée.
  const renfort = reponse && reponse.question === question.trim() ? reponse : null;
  const deClaude = useMemo(
    () =>
      renfort?.etat === 'trouve'
        ? renfort.ids.flatMap((id) => tous.filter((p) => p.id === id))
        : [],
    [renfort, tous],
  );
  const proposes = trouves.length > 0 ? trouves : deClaude.length > 0 ? deClaude : tous;

  const etape = visite ? visite.parcours.etapes[visite.index] : null;
  const cible = useCible(etape?.ancre ?? null);

  // La taille de l'écran, pour placer le guide.
  useEffect(() => {
    const mesurer = () => setEcran({ l: window.innerWidth, h: window.innerHeight });
    const image = requestAnimationFrame(mesurer);
    window.addEventListener('resize', mesurer);
    return () => {
      cancelAnimationFrame(image);
      window.removeEventListener('resize', mesurer);
    };
  }, []);

  const ouvrir = useCallback(() => {
    setOuverte(true);
    requestAnimationFrame(() => champ.current?.focus());
  }, []);

  const fermer = useCallback(() => {
    setOuverte(false);
    bouton.current?.focus();
  }, []);

  // Demander à Claude : seulement sur un clic, jamais en tapant. La question
  // quitte alors le navigateur — c'est dit à côté du bouton.
  const demander = useCallback(async () => {
    const posee = question.trim();
    if (!posee) return;
    setReponse({ question: posee, etat: 'attente', ids: [] });
    try {
      const retour = await fetch('/api/aide/renfort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: posee }),
      });
      const corps: unknown = await retour.json().catch(() => null);
      const lu = (corps ?? {}) as { parcours?: unknown; erreur?: unknown };

      if (!retour.ok) {
        setReponse({
          question: posee,
          etat: 'echec',
          ids: [],
          message: typeof lu.erreur === 'string' ? lu.erreur : undefined,
        });
        return;
      }

      const ids = Array.isArray(lu.parcours)
        ? lu.parcours.filter((id): id is string => typeof id === 'string')
        : [];
      setReponse({ question: posee, etat: ids.length > 0 ? 'trouve' : 'rien', ids });
    } catch {
      setReponse({ question: posee, etat: 'echec', ids: [] });
    }
  }, [question]);

  const montrer = useCallback((parcours: Parcours) => {
    setVisite({ parcours, index: 0 });
    setOuverte(false);
  }, []);

  const emmener = useCallback(
    (parcours: Parcours) => {
      if (!parcours.destination) return;
      router.push(parcours.destination);
      setVisite({ parcours, index: etapeDArrivee(parcours) });
      setOuverte(false);
    },
    [router],
  );

  const avancer = useCallback((de: number) => {
    setVisite((v) => {
      // Un clic arrivé en retard sur une étape déjà quittée ne compte pas.
      if (!v || v.index !== de) return v;
      return de + 1 < v.parcours.etapes.length ? { ...v, index: de + 1 } : null;
    });
  }, []);

  const reculer = useCallback(() => {
    setVisite((v) => (v && v.index > 0 ? { ...v, index: v.index - 1 } : v));
  }, []);

  // Cliquer l'élément désigné, c'est faire l'étape : on passe à la suivante.
  // En capture, pour l'entendre même si l'écran arrête l'événement en route.
  const ancre = etape?.ancre ?? null;
  const index = visite?.index ?? 0;
  useEffect(() => {
    if (!ancre) return;
    const clic = (e: MouseEvent) => {
      const vise = e.target instanceof Element ? e.target.closest(selecteur(ancre)) : null;
      if (vise) window.setTimeout(() => avancer(index), 0);
    };
    document.addEventListener('click', clic, true);
    return () => document.removeEventListener('click', clic, true);
  }, [ancre, index, avancer]);

  // Échap referme ce qui est ouvert : la visite d'abord, la fenêtre ensuite.
  useEffect(() => {
    if (!visite && !ouverte) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (visite) setVisite(null);
      else fermer();
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [visite, ouverte, fermer]);

  if (tous.length === 0) return null;

  const place = cible.boite
    ? placer(cible.boite, { ecran, guide: GUIDE, personnage: PERSONNAGE })
    : null;

  const ailleurs = etape ? ecranDe(etape) : null;
  const surLeBonEcran = ailleurs ? chemin === cheminDe(ailleurs) : true;
  const derniere = visite ? visite.index === visite.parcours.etapes.length - 1 : false;

  return (
    <>
      {!visite && (
        <button
          ref={bouton}
          type="button"
          className="aide-bouton"
          aria-expanded={ouverte}
          aria-controls="aide-fenetre"
          onClick={() => (ouverte ? fermer() : ouvrir())}
        >
          <span aria-hidden="true" className="aide-bouton-signe">
            ?
          </span>
          Aide
        </button>
      )}

      {ouverte && !visite && (
        <section id="aide-fenetre" className="aide-fenetre" aria-label="Aide">
          <header className="aide-fenetre-tete">
            <h2>Aide</h2>
            <button type="button" className="lien-nu" onClick={fermer} aria-label="Fermer l’aide">
              ✕
            </button>
          </header>

          <div className="aide-fenetre-corps">
            <label className="visuellement-cache" htmlFor="aide-question">
              Votre question
            </label>
            <input
              ref={champ}
              id="aide-question"
              className="recherche"
              type="search"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Que cherchez-vous ? Ex. la liste de mes candidats"
              autoComplete="off"
            />

            {/* Claude en renfort : proposé seulement quand la recherche locale
                n'a rien trouvé, et jamais envoyé sans ce clic. */}
            {sansReponse && renfortOuvert && renfort?.etat !== 'trouve' && (
              <div className="aide-renfort">
                <button
                  type="button"
                  className="bouton bouton--fort bouton--petit"
                  onClick={demander}
                  disabled={renfort?.etat === 'attente'}
                >
                  {renfort?.etat === 'attente' ? 'Claude cherche…' : 'Demander à Claude'}
                </button>
                <p className="aide">
                  Votre question sera envoyée à Claude (Anthropic, États-Unis). N’y écrivez le nom
                  de personne.
                </p>
              </div>
            )}

            <p className="maigre aide-fenetre-note" role="status">
              {renfort?.etat === 'trouve'
                ? 'Claude propose :'
                : renfort?.etat === 'rien'
                  ? 'Claude n’a rien trouvé non plus. Voici tout ce que je sais montrer :'
                  : renfort?.etat === 'echec'
                    ? `${renfort.message ?? 'Claude n’a pas pu répondre.'} Voici tout ce que je sais montrer :`
                    : sansReponse
                      ? 'Je n’ai pas trouvé. Voici tout ce que je sais montrer :'
                      : trouves.length > 0
                        ? 'Voici ce qui répond à votre question :'
                        : 'Posez votre question, ou choisissez dans la liste :'}
            </p>

            <ul className="aide-parcours">
              {proposes.map((p) => (
                <li key={p.id}>
                  <span className="aide-parcours-titre">{p.titre}</span>
                  <span className="aide-parcours-gestes">
                    <button
                      type="button"
                      className="bouton bouton--petit"
                      onClick={() => montrer(p)}
                    >
                      Montre-moi
                    </button>
                    {p.destination && (
                      <button
                        type="button"
                        className="bouton bouton--fort bouton--petit"
                        onClick={() => emmener(p)}
                      >
                        Emmène-moi
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {visite && etape && (
        <>
          {cible.boite && (
            <div
              className="aide-halo"
              aria-hidden="true"
              style={{
                left: cible.boite.x - 5,
                top: cible.boite.y - 5,
                width: cible.boite.l + 10,
                height: cible.boite.h + 10,
              }}
            />
          )}

          <div
            className={`aide-guide aide-guide--${place ? place.cote : 'coin'}`}
            style={
              place
                ? place.depuisLeBas
                  ? { left: place.x, bottom: place.y }
                  : { left: place.x, top: place.y }
                : undefined
            }
          >
            <Personnage direction={place ? place.direction : null} />

            <div className="aide-bulle" role="status" aria-live="polite">
              <p className="aide-bulle-etape">
                Étape {visite.index + 1} sur {visite.parcours.etapes.length}
                <span aria-hidden="true"> · </span>
                {visite.parcours.titre}
              </p>

              <p className="aide-bulle-texte">{etape.texte}</p>

              {cible.introuvable && !surLeBonEcran && ailleurs && (
                <p className="aide-bulle-note">
                  Cet élément est sur un autre écran.{' '}
                  <button
                    type="button"
                    className="bouton bouton--fort bouton--petit"
                    onClick={() => router.push(ailleurs)}
                  >
                    M’y emmener
                  </button>
                </p>
              )}

              {cible.introuvable && surLeBonEcran && (
                <p className="aide-bulle-note">
                  {etape.siAbsent ?? 'Je ne vois pas cet élément sur cet écran.'}
                </p>
              )}

              <div className="aide-bulle-gestes">
                {visite.index > 0 && (
                  <button type="button" className="bouton bouton--petit" onClick={reculer}>
                    Précédent
                  </button>
                )}
                <button
                  type="button"
                  className="bouton bouton--petit"
                  onClick={() => avancer(visite.index)}
                >
                  {derniere ? 'Terminer' : 'Suivant'}
                </button>
                {!derniere && (
                  <button
                    type="button"
                    className="lien-nu"
                    onClick={() => setVisite(null)}
                    aria-label="Arrêter la visite"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
