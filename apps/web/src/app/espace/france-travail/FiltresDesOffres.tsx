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
 * voile rien, et se referme d'un clic ailleurs ou d'« Échap ». Le secteur est
 * un menu déroulant du système — sur un iPad, c'est la roue native.
 *
 * `useOptimistic` : la case se coche à l'instant du clic, sans attendre que le
 * serveur ait rendu la liste.
 *
 * La recherche s'applique en tapant, après un court silence : relire la liste
 * à chaque lettre ferait dix allers-retours pour un mot. « Entrée » l'applique
 * tout de suite.
 */

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
  const [ouvert, setOuvert] = useState(false);
  const cadre = useRef<HTMLDivElement>(null);

  // Ce qui est tapé, à l'instant : en avance sur l'adresse le temps du silence.
  const [saisie, setSaisie] = useState(filtres.recherche);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (minuterie.current && clearTimeout(minuterie.current)), []);

  // Le panneau se referme d'un clic ailleurs ou d'« Échap » — sans rien
  // annuler : ce qui est coché est déjà appliqué.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (cadre.current && !cadre.current.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  const appliquer = (suivants: Filtres) => {
    demarrer(() => {
      afficher(suivants);
      router.replace(adresseDesOffres(suivants), { scroll: false });
    });
  };

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
          onClick={() => setOuvert((o) => !o)}
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

      <select
        className="filtre-loge"
        aria-label="Secteur d’activité"
        value={affiches.secteur}
        onChange={(e) => appliquer(choisirSecteur(affiches, e.target.value))}
      >
        <option value="">Tous les secteurs d’activité</option>
        {menus.secteurs.map((s) => (
          <option key={s.code} value={s.code}>
            {s.intitule ? `${s.code} — ${s.intitule}` : s.code}
          </option>
        ))}
      </select>
      </>
      )}
    </div>
  );
}
