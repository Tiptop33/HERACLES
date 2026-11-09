'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Corbeille } from '@/components/Icones';
import {
  chercherDansLaColonne,
  COLONNES,
  compteDeLaColonne,
  SORTES,
  type Adresse,
  type DocumentArchive,
  type Sorte,
} from '@/lib/documents/archives';

/**
 * Les trois colonnes des PDF archivés — Compte-rendu, Affiche, Affichette
 * (migration 0069).
 *
 * Le même tableau à deux endroits : l'accueil, pour l'exercice en cours, et
 * Paramètres › Archives, pour les exercices précédents. Un seul composant,
 * pour qu'ils ne divergent pas.
 *
 * `adresse` est la page qui le montre : la corbeille y ouvre la fenêtre de
 * confirmation, et l'effacement y ramène.
 *
 * `compter` met le nombre de PDF à côté de chaque titre (Paramètres › Archives).
 *
 * `recherche` ajoute un champ sous chaque en-tête (Paramètres › Archives). Le
 * filtre s'applique à chaque lettre tapée, dans le navigateur : les lignes
 * sont déjà là, quelques dizaines par colonne, et un aller-retour au serveur
 * pour chaque frappe ne servirait à rien.
 *
 * `enTeteFixe` (Paramètres › Archives) fige tout ce qui est au-dessus des
 * premiers liens : chaque liste défile dans sa colonne, sur la hauteur qui
 * reste à l'écran, et la page ne bouge plus. Les colonnes prennent la largeur
 * de leur plus long nom — un lien par ligne. Cette hauteur se mesure dans le
 * navigateur : c'est la seconde raison d'être un composant client.
 */
export default function ColonnesDesArchives({
  colonnes,
  adresse,
  avant = false,
  compter = false,
  recherche = false,
  enTeteFixe = false,
}: {
  colonnes: Record<Sorte, DocumentArchive[]>;
  adresse: Adresse;
  /** Les exercices précédents : la colonne vide le dit autrement. */
  avant?: boolean;
  /** Le nombre de PDF à côté de chaque titre. */
  compter?: boolean;
  /** Un champ de recherche par colonne. */
  recherche?: boolean;
  /** Les titres restent en place, les listes défilent ; un lien par ligne. */
  enTeteFixe?: boolean;
}) {
  const [cherche, setCherche] = useState<Record<Sorte, string>>({
    'compte-rendu': '',
    affiche: '',
    affichette: '',
  });
  const racine = useRef<HTMLDivElement>(null);

  // La hauteur des listes : ce qui reste entre le haut des premiers liens et
  // le bas de l'écran, une fois retiré ce qui est sous le tableau (le pied du
  // cadre et de la page). La page tient alors dans l'écran et ne défile plus ;
  // seules les listes défilent. Remesurée quand la fenêtre ou la mise en page
  // change — un titre qui passe sur deux lignes, l'iPad qu'on tourne.
  useEffect(() => {
    const tableau = racine.current;
    if (!enTeteFixe || !tableau) return;

    const ajuster = () => {
      const liste = tableau.querySelector<HTMLElement>('.archives-defile');
      if (!liste) return;
      const defilement = window.scrollY;
      const hautDesListes = liste.getBoundingClientRect().top + defilement;
      const basDuTableau = tableau.getBoundingClientRect().bottom + defilement;
      const dessous = document.documentElement.scrollHeight - basDuTableau;
      const hauteur = Math.max(240, Math.floor(window.innerHeight - hautDesListes - dessous));
      const valeur = `${hauteur}px`;
      if (tableau.style.getPropertyValue('--archives-hauteur') !== valeur) {
        tableau.style.setProperty('--archives-hauteur', valeur);
      }
    };

    ajuster();
    window.addEventListener('resize', ajuster);
    const observateur = new ResizeObserver(ajuster);
    observateur.observe(document.body);
    return () => {
      window.removeEventListener('resize', ajuster);
      observateur.disconnect();
    };
  }, [enTeteFixe]);

  return (
    <div ref={racine} className={`archives${enTeteFixe ? ' archives--en-tete-fixe' : ''}`}>
      {SORTES.map((sorte) => {
        const toutes = colonnes[sorte];
        const lignes = recherche ? chercherDansLaColonne(toutes, cherche[sorte]) : toutes;

        return (
          <div key={sorte} className="archives-colonne">
            <h3>
              {COLONNES[sorte].titre}
              {compter && (
                <span className="archives-compte">
                  {' '}({compteDeLaColonne(lignes.length, toutes.length)})
                </span>
              )}
            </h3>

            {/* Pas de champ sur une colonne vide : il n'y aurait rien à y
                chercher. */}
            {recherche && toutes.length > 0 && (
              <input
                className="recherche archives-recherche"
                type="search"
                value={cherche[sorte]}
                onChange={(e) => setCherche((precedent) => ({ ...precedent, [sorte]: e.target.value }))}
                placeholder="Chercher…"
                aria-label={`Chercher dans la colonne ${COLONNES[sorte].titre}`}
              />
            )}

            {toutes.length === 0 ? (
              <p className="archives-vide">
                {avant ? COLONNES[sorte].videAvant : COLONNES[sorte].vide}
              </p>
            ) : lignes.length === 0 ? (
              <p className="archives-vide">Aucun PDF ne correspond.</p>
            ) : (
              <ul className="liste-nue archives-defile">
                {lignes.map((d) => (
                  <li key={d.id} className="archives-ligne">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                      {d.nom ?? 'Document sans nom'}
                    </a>
                    {/* Rouge, sur la ligne même du PDF, et seulement là où la
                        base accepterait d'effacer : administrateur, Vénérable
                        Maître, Secrétaire. La corbeille n'efface pas : elle
                        ouvre la confirmation. */}
                    {d.effacable && (
                      <Link
                        href={`${adresse}?effacer=${d.id}`}
                        scroll={false}
                        className="geste geste--retirer"
                        aria-label={`Effacer ${d.nom ?? 'ce PDF'}`}
                        title="Effacer ce PDF"
                      >
                        <Corbeille />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
