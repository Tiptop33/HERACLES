'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adresseDesOffres,
  basculerDepartement,
  chercher,
  choisirSecteur,
  LONGUEUR_DE_RECHERCHE,
  nomDuDepartement,
  resumeDesDepartements,
  tousLesDepartements,
  type FiltresDesOffres as Filtres,
  type MenusDesOffres,
} from '@/lib/offres';

/**
 * La recherche et les deux filtres de l'écran « France Travail » (23 novembre
 * 2026, à la demande) : des mots à chercher dans les offres, un ou plusieurs
 * départements, et un secteur d'activité.
 *
 * Chaque geste s'applique aussitôt : il réécrit l'adresse, et la page relit la
 * liste. Pas de bouton « Appliquer ». L'adresse porte les filtres — elle se
 * recharge, se garde en favori et s'envoie telle quelle. Changer un filtre
 * ramène à la première page.
 *
 * Les départements se cochent dans un panneau flottant, non modal : il ne
 * voile rien, et se referme d'un clic ailleurs ou d'« Échap ». Le secteur se
 * choisit dans un panneau du même genre, un secteur par ligne.
 *
 * `useOptimistic` : la case se coche à l'instant du clic, sans attendre que le
 * serveur ait rendu la liste.
 *
 * La recherche s'applique en tapant, après un court silence : relire la liste
 * à chaque lettre ferait dix allers-retours pour un mot. « Entrée » l'applique
 * tout de suite.
 */

/** « F — Construction ». Un secteur sans intitulé connu s'affiche par sa lettre. */
function libelleDuSecteur(s: { code: string; intitule: string }): string {
  return s.intitule ? `${s.code} — ${s.intitule}` : s.code;
}

/** Le silence, en millisecondes, après lequel la recherche part. */
const SILENCE = 350;

export default function FiltresDesOffres({
  filtres,
  menus,
  menusLus = true,
}: {
  filtres: Filtres;
  menus: MenusDesOffres;
  /** Faux quand la base n'a pas rendu les menus : seule la recherche s'affiche. */
  menusLus?: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [affiches, afficher] = useOptimistic(filtres);
  // Un seul panneau à la fois : ouvrir l'un referme l'autre.
  const [panneau, setPanneau] = useState<'departements' | 'secteurs' | null>(null);
  const ouvert = panneau === 'departements';
  const secteursOuverts = panneau === 'secteurs';
  const cadre = useRef<HTMLDivElement>(null);
  const cadreDesSecteurs = useRef<HTMLDivElement>(null);

  // Ce qui est tapé, à l'instant : en avance sur l'adresse le temps du silence.
  const [saisie, setSaisie] = useState(filtres.recherche);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (minuterie.current && clearTimeout(minuterie.current)), []);

  // Le panneau se referme d'un clic ailleurs ou d'« Échap » — sans rien
  // annuler : ce qui est coché est déjà appliqué.
  useEffect(() => {
    if (!panneau) return;
    const dehors = (e: PointerEvent) => {
      const ou = panneau === 'departements' ? cadre.current : cadreDesSecteurs.current;
      if (ou && !ou.contains(e.target as Node)) setPanneau(null);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanneau(null);
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', touche);
    };
  }, [panneau]);

  const appliquer = (suivants: Filtres) => {
    demarrer(() => {
      afficher(suivants);
      router.replace(adresseDesOffres(suivants), { scroll: false });
    });
  };

  const secteurChoisi = menus.secteurs.find((x) => x.code === affiches.secteur) ?? null;

  /** Applique la recherche — tout de suite, ou après le silence. */
  const lancerLaRecherche = (texte: string, attente: number) => {
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      minuterie.current = null;
      const suivants = chercher(affiches, texte);
      // Rien de neuf — une espace en plus, la même recherche : on ne relit pas.
      if (suivants.recherche !== affiches.recherche) appliquer(suivants);
    }, attente);
  };

  return (
    <div className="filtres-des-offres" aria-busy={enCours}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          lancerLaRecherche(saisie, 0);
        }}
      >
        <input
          className="recherche"
          type="search"
          value={saisie}
          maxLength={LONGUEUR_DE_RECHERCHE}
          onChange={(e) => {
            setSaisie(e.target.value);
            lancerLaRecherche(e.target.value, SILENCE);
          }}
          placeholder="Chercher un métier, une entreprise, un lieu…"
          aria-label="Chercher dans les offres"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      {menusLus && (
      <>
      <div className="choix-departements" ref={cadre}>
        <button
          type="button"
          className="filtre-loge choix-departements-bouton"
          aria-haspopup="true"
          aria-expanded={ouvert}
          aria-controls="panneau-departements"
          onClick={() => setPanneau(ouvert ? null : 'departements')}
        >
          {resumeDesDepartements(affiches.departements)}
          <span aria-hidden="true"> ▾</span>
        </button>

        {ouvert && (
          <div
            id="panneau-departements"
            className="choix-departements-panneau"
            role="group"
            aria-label="Départements"
          >
            {menus.departements.length === 0 ? (
              <p className="maigre">Aucune offre en cours ne porte de département.</p>
            ) : (
              <>
                <label className="choix-departements-ligne">
                  <input
                    type="checkbox"
                    checked={affiches.departements.length === 0}
                    // Déjà « tous » : il n'y a rien à décocher.
                    disabled={affiches.departements.length === 0}
                    onChange={() => appliquer(tousLesDepartements(affiches))}
                  />
                  Tous les départements
                </label>
                {menus.departements.map((numero) => (
                  <label key={numero} className="choix-departements-ligne">
                    <input
                      type="checkbox"
                      checked={affiches.departements.includes(numero)}
                      onChange={() => appliquer(basculerDepartement(affiches, numero))}
                    />
                    {nomDuDepartement(numero)}
                  </label>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Les secteurs : un panneau maison, et non le menu du système. Sur un
          iPad, le menu natif coupait les longs intitulés sur plusieurs lignes ;
          ici chaque secteur tient sur une ligne, coupé d'une ellipse s'il le
          faut — l'intitulé entier reste dans l'infobulle. Un seul choix : le
          panneau se referme dès qu'il est fait. */}
      <div className="choix-departements" ref={cadreDesSecteurs}>
        <button
          type="button"
          className="filtre-loge choix-secteur-bouton"
          aria-haspopup="true"
          aria-expanded={secteursOuverts}
          aria-controls="panneau-secteurs"
          aria-label="Secteur d’activité"
          title={secteurChoisi ? libelleDuSecteur(secteurChoisi) : undefined}
          onClick={() => setPanneau(secteursOuverts ? null : 'secteurs')}
        >
          <span className="choix-secteur-texte">
            {secteurChoisi ? libelleDuSecteur(secteurChoisi) : 'Tous les secteurs d’activité'}
          </span>
          <span aria-hidden="true">▾</span>
        </button>

        {secteursOuverts && (
          <div
            id="panneau-secteurs"
            className="choix-departements-panneau choix-secteur-panneau"
            role="radiogroup"
            aria-label="Secteur d’activité"
          >
            {[{ code: '', intitule: '' }, ...menus.secteurs].map((s) => {
              const libelle = s.code ? libelleDuSecteur(s) : 'Tous les secteurs d’activité';
              return (
                <label key={s.code || 'tous'} className="choix-departements-ligne" title={libelle}>
                  <input
                    type="radio"
                    name="secteur-des-offres"
                    checked={affiches.secteur === s.code}
                    onChange={() => {
                      appliquer(choisirSecteur(affiches, s.code));
                      setPanneau(null);
                    }}
                  />
                  <span className="choix-secteur-texte">{libelle}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
