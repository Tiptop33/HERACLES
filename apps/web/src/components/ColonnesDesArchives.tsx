'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Corbeille } from '@/components/Icones';
import {
  chercherDansLaColonne,
  COLONNES,
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
 * `recherche` ajoute un champ sous chaque en-tête (Paramètres › Archives). Le
 * filtre s'applique à chaque lettre tapée, dans le navigateur : les lignes
 * sont déjà là, quelques dizaines par colonne, et un aller-retour au serveur
 * pour chaque frappe ne servirait à rien. C'est la seule raison pour laquelle
 * ce composant est un composant client.
 */
export default function ColonnesDesArchives({
  colonnes,
  adresse,
  avant = false,
  recherche = false,
}: {
  colonnes: Record<Sorte, DocumentArchive[]>;
  adresse: Adresse;
  /** Les exercices précédents : la colonne vide le dit autrement. */
  avant?: boolean;
  /** Un champ de recherche par colonne. */
  recherche?: boolean;
}) {
  const [cherche, setCherche] = useState<Record<Sorte, string>>({
    'compte-rendu': '',
    affiche: '',
    affichette: '',
  });

  return (
    <div className="archives">
      {SORTES.map((sorte) => {
        const toutes = colonnes[sorte];
        const lignes = recherche ? chercherDansLaColonne(toutes, cherche[sorte]) : toutes;

        return (
          <div key={sorte} className="archives-colonne">
            <h3>{COLONNES[sorte].titre}</h3>

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
              <ul className="liste-nue">
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
