'use client';

import { useEffect, useRef, useState } from 'react';
import ChoixDesSecteursDuCandidat from '@/components/ChoixDesSecteursDuCandidat';
import {
  FILTRES_BUBBLE,
  cibleDeLaLigne,
  cleDeLaLigne,
  compterSecteursBubble,
  dateCourte,
  filtrerSecteursBubble,
  libelleDeLaLigne,
  origineDeLaLigne,
  sousLeSecteur,
  type FiltreBubble,
  type SecteurBubble,
} from '@/lib/secteurs-bubble';

/**
 * La correspondance des secteurs Bubble, ligne par ligne (maquette validée le
 * 13 novembre 2026). « Valider » retient la proposition ; « Changer » ouvre la
 * recherche de la fiche ; « Aucun ne convient » laisse aux fiches le seul
 * texte de Bubble. Chaque geste s'enregistre aussitôt, et la base l'applique
 * aux fiches dans la foulée.
 */
export default function CorrespondanceDesSecteurs({ initiales }: { initiales: SecteurBubble[] }) {
  const [lignes, setLignes] = useState(initiales);
  const [filtre, setFiltre] = useState<FiltreBubble>('tous');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<{ cle: string; texte: string } | null>(null);
  const [mot, setMot] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dire = (texte: string) => {
    setMot(texte);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setMot(null), 1400);
  };
  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
  }, []);

  /** Régler une ligne ; rend le message d'erreur, ou null si c'est enregistré. */
  async function regler(l: SecteurBubble, code: string | null, merci: string): Promise<string | null> {
    const cle = cleDeLaLigne(l);
    setOccupe(cle);
    setErreur(null);
    try {
      const reponse = await fetch('/api/parametres/secteurs-d-activite', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: l.source, valeur: l.valeur, code }),
      });
      const lu = (await reponse.json().catch(() => null)) as { lignes?: SecteurBubble[]; erreur?: string } | null;
      if (!reponse.ok || !lu?.lignes) {
        const texte = lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.';
        setErreur({ cle, texte });
        return texte;
      }
      setLignes(lu.lignes);
      setOuverte(null);
      dire(merci);
      return null;
    } catch {
      const texte = 'Le serveur ne répond pas. Ce changement n’est pas enregistré.';
      setErreur({ cle, texte });
      return texte;
    } finally {
      setOccupe(null);
    }
  }

  const n = compterSecteursBubble(lignes);
  const visibles = filtrerSecteursBubble(lignes, filtre);

  if (lignes.length === 0) {
    return (
      <p className="secteurs-vide">
        Aucune fiche ne porte de secteur saisi dans Bubble — ou la reprise n’a pas encore eu lieu.
      </p>
    );
  }

  return (
    <div className="corr">
      <div className="reseau-compteurs">
        {(
          [
            [n.total, 'secteurs Bubble'],
            [n.valides, 'validés'],
            [n.a_valider, 'à valider'],
            [n.sans, 'sans correspondance'],
          ] as const
        ).map(([k, texte]) => (
          <div className="reseau-compteur" key={texte}>
            <strong>{k}</strong>
            <span>{texte}</span>
          </div>
        ))}
      </div>

      <div className="reseau-filtres corr-filtres" role="group" aria-label="Filtrer les secteurs Bubble">
        {FILTRES_BUBBLE.map(([cle, texte]) => (
          <button key={cle} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
            {texte}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="secteurs-vide">Aucun secteur Bubble dans cette catégorie.</p>
      ) : (
        <ul className="corr-liste">
          {visibles.map((l, i) => {
            const cle = cleDeLaLigne(l);
            const cible = cibleDeLaLigne(l);
            const enCours = occupe === cle;
            return (
              <li className="corr-ligne" key={cle}>
                <span className="corr-bubble">
                  <strong className={l.libelle ? undefined : 'corr-sans-intitule'}>{libelleDeLaLigne(l)}</strong>
                  <small>{origineDeLaLigne(l)}</small>
                </span>
                <span className="corr-fleche" aria-hidden="true">
                  →
                </span>
                <span className="corr-cible">
                  {l.etat === 'sans' ? (
                    <span className="aucun">Aucun secteur — les fiches gardent le texte de Bubble</span>
                  ) : cible ? (
                    <>
                      <strong>
                        <span className="secteur-code">{cible.code}</span>
                        {cible.intitule}
                      </strong>
                      <small>
                        {sousLeSecteur(cible)}
                        {l.etat === 'a_valider' && l.propose?.mot ? (
                          <> · proposé d’après «&nbsp;{l.propose.mot}&nbsp;»</>
                        ) : null}
                      </small>
                    </>
                  ) : (
                    <span className="aucun">Aucun secteur trouvé&nbsp;: choisissez-le</span>
                  )}
                </span>
                <span className="corr-etat">
                  {l.etat === 'valide' ? (
                    <span className="valide">✓ Validé{dateCourte(l.valide_le) ? ` le ${dateCourte(l.valide_le)}` : ''}</span>
                  ) : l.etat === 'sans' ? (
                    <span className="sans">Sans correspondance</span>
                  ) : cible ? (
                    <span className="a-valider">Proposé · à valider</span>
                  ) : (
                    <span className="a-valider">À choisir</span>
                  )}
                  {l.etat === 'a_valider' && cible && (
                    <button
                      type="button"
                      className="valider"
                      disabled={enCours}
                      onClick={() => void regler(l, cible.code, 'Validé')}
                    >
                      Valider
                    </button>
                  )}
                  <button
                    type="button"
                    className="changer"
                    disabled={enCours}
                    aria-expanded={ouverte === cle}
                    onClick={() => {
                      setErreur(null);
                      setOuverte(ouverte === cle ? null : cle);
                    }}
                  >
                    {l.etat === 'a_valider' && !cible ? 'Choisir' : 'Changer'}
                  </button>
                </span>
                {erreur?.cle === cle && ouverte !== cle && (
                  <p className="erreur corr-erreur" role="alert">
                    {erreur.texte}
                  </p>
                )}
                {ouverte === cle && (
                  <div className="corr-changer">
                    <p id={`corr-titre-${i}`}>
                      Le secteur qui correspond à «&nbsp;{libelleDeLaLigne(l)}&nbsp;»&nbsp;: un grand secteur ou une
                      division.
                    </p>
                    <ChoixDesSecteursDuCandidat
                      mode="candidat"
                      initiale={[]}
                      idDuTitre={`corr-titre-${i}`}
                      adresses={{ recherche: '/api/secteurs/recherche', liste: '/api/secteurs/liste' }}
                      // Un choix dans la recherche ou dans la liste vaut validation.
                      enregistrer={async (codes) => {
                        const texte = await regler(l, codes[0] ?? null, 'Validé');
                        return texte ?? [];
                      }}
                    />
                    <button
                      type="button"
                      className="aucun-convient"
                      disabled={enCours}
                      onClick={() => void regler(l, null, 'Enregistré')}
                    >
                      Aucun ne convient&nbsp;: garder seulement le texte de Bubble
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className={`secteurs-enregistre${mot ? ' secteurs-enregistre--visible' : ''}`} role="status" aria-live="polite">
        {mot ?? ''}
      </div>
    </div>
  );
}
