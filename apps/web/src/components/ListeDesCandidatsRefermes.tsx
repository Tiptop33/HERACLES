'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  chercherUnCandidat,
  LISTES_REFERMEES,
  type CandidatReferme,
  type ListeRefermee,
} from '@/lib/candidats-refermes';
import { jourEntier } from '@/lib/documents/formats';

/**
 * La liste des candidats clôturés ou archivés de Paramètres › Archives, avec
 * la ligne de l'écran Candidats : photo, NOM Prénom, métier · ville, numéro
 * de fiche — et, à droite, la date de création du dossier et celle de sa
 * clôture ou de son archivage. « ≈ » marque une date approchée, reprise de la
 * dernière modification de la fiche dans Bubble, qui ne datait ni l'une ni
 * l'autre (migration 0071). Un clic ouvre la fiche dans l'écran Candidats.
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
  liste,
}: {
  lignes: CandidatReferme[];
  /** Clôturés ou archivés : ce que dit la liste vide, et le mot de la date. */
  liste: ListeRefermee;
}) {
  const { vide, ferme, inconnue } = LISTES_REFERMEES[liste];
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

                <span className="refermes-dates">
                  <small>Créé le {jourEntier(c.cree_le) || '—'}</small>
                  <small>
                    {c.ferme_le ? (
                      <>
                        {ferme}{' '}
                        {c.ferme_estime && (
                          <abbr title="Date approchée : la dernière modification de la fiche dans Bubble">
                            ≈{' '}
                          </abbr>
                        )}
                        {jourEntier(c.ferme_le)}
                      </>
                    ) : (
                      inconnue
                    )}
                  </small>
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
