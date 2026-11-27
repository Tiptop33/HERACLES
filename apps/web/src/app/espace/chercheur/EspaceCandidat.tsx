'use client';

import { useState } from 'react';
import Aide from '@/components/aide/Aide';
import {
  initialesDe,
  remplissage,
  type DocumentDuCandidat,
  type FicheDuCandidat,
  type MessageDuCandidat,
} from '@/lib/page-candidat';
import DocumentsDuCandidat from './DocumentsDuCandidat';
import FicheDuCandidatEditable from './FicheDuCandidat';
import MessagesDuCandidat from './MessagesDuCandidat';

/**
 * La page du candidat (0105), maquette validée le 25 novembre 2026
 * (docs/maquettes/page-candidat.html).
 *
 * Sur un écran large, deux colonnes : les offres et la fiche à gauche, « Où
 * j'en suis » et les documents à droite. Sur un téléphone, une seule, dans
 * l'ordre où l'on s'en sert : le message d'abord, puis les offres, les
 * documents, la fiche.
 *
 * Rien de modal, aucun bouton « Enregistrer » : chaque geste part tout de
 * suite. La fiche vit ici, parce que l'en-tête en dépend — le prénom, la
 * photo, la jauge.
 */
export default function EspaceCandidat({
  initiale,
  documents,
  messages,
  offres,
  logo,
  maintenant,
}: {
  initiale: FicheDuCandidat;
  documents: DocumentDuCandidat[];
  messages: MessageDuCandidat[];
  /** Le bloc des offres, rendu par le serveur. */
  offres: React.ReactNode;
  /** Le logo, rendu par le serveur : il se lit sur le disque. */
  logo: React.ReactNode;
  /** L'heure du serveur : la même au premier rendu des deux côtés. */
  maintenant: number;
}) {
  const [fiche, setFiche] = useState(initiale);
  // Change à chaque photo posée : le navigateur ne garde pas l'ancienne.
  const [versionDeLaPhoto, setVersionDeLaPhoto] = useState(0);

  const jauge = remplissage(fiche);
  const portrait = fiche.a_une_photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/espace-candidat/photo?v=${versionDeLaPhoto}`} alt="" />
  ) : (
    <span aria-hidden="true">{initialesDe(fiche.prenom, fiche.nom)}</span>
  );

  function allerA(cle: string) {
    const cible =
      document.getElementById(`pc-champ-${cle}`) ??
      document.querySelector<HTMLElement>(`[data-champ="${cle}"] input, [data-champ="${cle}"] button`);
    if (!cible) return;
    cible.closest('details')?.setAttribute('open', '');
    cible.scrollIntoView({ block: 'center' });
    cible.focus({ preventScroll: true });
  }

  return (
    <div className="pc">
      <header className="pc-barre">
        <a className="pc-logo" href="/espace/chercheur">
          {logo}
          <span>HERACLES</span>
        </a>
        <div className="pc-qui">
          <span className="pc-portrait">{portrait}</span>
          <span className="pc-nom">{[fiche.prenom, fiche.nom].filter(Boolean).join(' ')}</span>
          <form action="/api/deconnexion" method="post">
            <button type="submit" className="pc-lien" data-aide="candidat-deconnexion">
              Se déconnecter
            </button>
          </form>
        </div>
      </header>

      <main className="pc-enveloppe">
        <div className="pc-tete">
          <a className="pc-portrait pc-portrait--grand" href="#pc-photo" title="Changer ma photo">
            {portrait}
          </a>
          <div>
            <h1>Bonjour {fiche.prenom ?? ''}</h1>
            <p className="pc-suivi" data-aide="candidat-referent">
              {fiche.referent
                ? `${fiche.referent}, votre référent, suit votre recherche.`
                : 'Un référent va prendre votre dossier en charge.'}
            </p>
          </div>
          <div className="pc-jauge" aria-live="polite" data-aide="candidat-jauge">
            <div className="pc-jauge-ligne">
              Votre fiche est remplie <span>{jauge.pourcentage}&nbsp;%</span>
            </div>
            <div className="pc-piste">
              <i style={{ width: `${jauge.pourcentage}%` }} />
            </div>
            {jauge.manquent.length > 0 ? (
              <div className="pc-manque">
                À compléter&nbsp;:
                {jauge.manquent.map((m) => (
                  <button key={m.cle} type="button" className="pc-lien" onClick={() => allerA(m.cle)}>
                    {m.libelle}
                  </button>
                ))}
              </div>
            ) : (
              <div className="pc-manque">Votre fiche est complète.</div>
            )}
          </div>
        </div>

        <nav className="pc-ancres" aria-label="Aller à">
          <a href="#pc-messages">Où j’en suis</a>
          <a href="#pc-offres">Offres pour moi</a>
          <a href="#pc-documents">Mes documents</a>
          <a href="#pc-fiche">Ma fiche</a>
        </nav>

        <div className="pc-grille">
          <div className="pc-col">
            <section
              className="pc-bloc"
              id="pc-offres"
              aria-labelledby="pc-offres-titre"
              data-aide="candidat-offres"
            >
              {offres}
            </section>
            <FicheDuCandidatEditable
              fiche={fiche}
              changer={(maj) => setFiche((f) => ({ ...f, ...maj }))}
              photoChangee={() => setVersionDeLaPhoto((v) => v + 1)}
              portrait={portrait}
            />
          </div>
          <div className="pc-col">
            <MessagesDuCandidat initiaux={messages} maintenantDuServeur={maintenant} />
            <DocumentsDuCandidat initiaux={documents} />
          </div>
        </div>
      </main>

      {/* L'aide, demandée le 27 novembre 2026 : son propre catalogue, une
          réponse par partie de la page, sans Claude — la question du candidat
          ne quitte pas son navigateur (lib/aide/parcours-publics.ts). */}
      <Aide catalogue="candidat" />
    </div>
  );
}
