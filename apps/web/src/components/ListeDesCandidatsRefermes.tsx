'use client';

import Link from 'next/link';
import { useState } from 'react';
import { chercherUnCandidat, type CandidatReferme } from '@/lib/candidats-refermes';

/**
 * La liste des candidats clôturés ou archivés de Paramètres › Archives, avec
 * la ligne de l'écran Candidats : photo, NOM Prénom, métier · ville, numéro
 * de fiche. Un clic ouvre la fiche dans l'écran Candidats.
 *
 * Le point orange « personne ne l'accompagne » n'y est pas : il signale un
 * dossier en cours qui attend quelqu'un, ce qu'un dossier refermé n'attend
 * plus.
 *
 * Composant client pour la seule recherche, filtrée à chaque lettre comme
 * celle des colonnes de PDF : les lignes sont déjà là.
 */
export default function ListeDesCandidatsRefermes({
  lignes,
  vide,
}: {
  lignes: CandidatReferme[];
  /** Ce que dit la liste quand elle n'a personne. */
  vide: string;
}) {
  const [recherche, setRecherche] = useState('');
  const trouves = chercherUnCandidat(lignes, recherche);

  if (lignes.length === 0) return <p className="archives-vide">{vide}</p>;

  return (
    <>
      <input
        className="recherche archives-recherche"
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Chercher…"
        aria-label="Chercher un candidat"
      />

      {trouves.length === 0 ? (
        <p className="archives-vide">Aucun candidat ne correspond.</p>
      ) : (
        <ul className="poste-rangs">
          {trouves.map((c) => (
            <li key={c.id}>
              <Link
                className={`poste-rang${c.famille ? ` poste-rang--${c.famille}` : ''}`}
                href={c.lien}
              >
                {c.a_une_photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="poste-rang-portrait"
                    src={`/espace/candidats/${c.id}/photo`}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                  />
                ) : (
                  <span className="poste-rang-portrait poste-rang-initiales" aria-hidden="true">
                    {c.initiales}
                  </span>
                )}

                <span className="poste-rang-textes">
                  <strong>{c.nom}</strong>
                  <small>{c.sous || 'métier non renseigné'}</small>
                </span>

                {c.numero !== null && (
                  <span className="poste-rang-numero">
                    <span className="visuellement-cache">Fiche n° </span>
                    {c.numero}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
