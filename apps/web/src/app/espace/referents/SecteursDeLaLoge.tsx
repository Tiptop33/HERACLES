'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOM_DU_NIVEAU,
  construireArbre,
  cochesDessous,
  dateDeLaListe,
  listeAncienne,
  rangerParSection,
  resumeDeLaListe,
  type Arbre,
  type LigneNaf,
  type ListeDeLaLoge,
  type SecteurTrouve,
} from '@/lib/secteurs';

/**
 * Le bloc « Secteurs représentés » de la page Référents (maquette validée le
 * 12 novembre 2026, docs/maquettes/secteurs-d-activite.html, écran 3).
 *
 * Le Secrétaire de la loge — ou un administrateur — y coche les secteurs
 * d'activité présents dans la loge : ni nom, ni nombre. Au moins la division,
 * puis aussi précis qu'il le veut. Chaque geste s'enregistre aussitôt ; la
 * liste affichée est toujours celle que la base a rendue, jamais celle que
 * l'écran croit avoir envoyée.
 *
 * Les autres référents de la loge lisent la liste, sans champ de recherche ni
 * arborescence. Le droit est dans la base (0091) : un bouton caché ne protège
 * rien.
 */

type Etat = { sorte: 'pret' } | { sorte: 'envoi' } | { sorte: 'erreur'; message: string };

const DELAI_RECHERCHE = 250;
const RESULTATS_MONTRES = 8;

export default function SecteursDeLaLoge({
  logeId,
  initiale,
}: {
  logeId: string;
  initiale: ListeDeLaLoge;
}) {
  const [liste, setListe] = useState(initiale);
  const [etat, setEtat] = useState<Etat>({ sorte: 'pret' });
  // Le geste en cours d'envoi, affiché tout de suite : la case se coche au
  // clic, puis la liste rendue par la base fait foi — ou la case revient.
  const [enCours, setEnCours] = useState<{ code: string; coche: boolean } | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  const [recherche, setRecherche] = useState('');
  // Chaque lot de propositions garde la recherche qui l'a produit : on n'affiche
  // que celui qui correspond à ce qui est tapé, sans état à vider.
  const [trouves, setTrouves] = useState<{ q: string; resultats: SecteurTrouve[] } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);

  const [parcourir, setParcourir] = useState(false);
  const [arbre, setArbre] = useState<Arbre | null>(null);
  const [arbreEnErreur, setArbreEnErreur] = useState<string | null>(null);
  const [deplies, setDeplies] = useState<Set<string>>(() => new Set());

  const racine = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enregistres = liste.secteurs.map((s) => s.code);
  const coches = !enCours
    ? enregistres
    : enCours.coche
      ? [...new Set([...enregistres, enCours.code])]
      : enregistres.filter((c) => c !== enCours.code);
  const ancienne = listeAncienne(liste.maj_le);

  // --- Cocher, décocher -------------------------------------------------------
  const basculer = useCallback(
    async (code: string, coche: boolean) => {
      setEtat({ sorte: 'envoi' });
      setEnCours({ code, coche });
      try {
        const reponse = await fetch(`/api/loges/${logeId}/secteurs`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, coche }),
        });
        const lu = (await reponse.json().catch(() => null)) as { liste?: ListeDeLaLoge; erreur?: string } | null;
        if (!reponse.ok || !lu?.liste) {
          setEnCours(null);
          setEtat({ sorte: 'erreur', message: lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.' });
          return;
        }
        setListe(lu.liste);
        setEnCours(null);
        setEtat({ sorte: 'pret' });
        setEnregistre(true);
        if (minuteur.current) clearTimeout(minuteur.current);
        minuteur.current = setTimeout(() => setEnregistre(false), 1400);
      } catch {
        setEnCours(null);
        setEtat({ sorte: 'erreur', message: 'Le serveur ne répond pas. Ce changement n’est pas enregistré.' });
      }
    },
    [logeId],
  );

  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
  }, []);

  // --- La recherche, un quart de seconde après la dernière touche -------------
  useEffect(() => {
    const q = recherche.trim();
    if (!q) return;
    const abandon = new AbortController();
    const attente = setTimeout(async () => {
      try {
        const reponse = await fetch(`/api/secteurs/recherche?q=${encodeURIComponent(q)}`, {
          signal: abandon.signal,
        });
        const lu = (await reponse.json().catch(() => null)) as { resultats?: SecteurTrouve[] } | null;
        setTrouves({ q, resultats: reponse.ok ? (lu?.resultats ?? []) : [] });
        setActif(0);
      } catch {
        // Une recherche abandonnée pour une plus récente : rien à dire.
      }
    }, DELAI_RECHERCHE);
    return () => {
      clearTimeout(attente);
      abandon.abort();
    };
  }, [recherche]);

  // Un clic ailleurs referme les propositions.
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  const resultats = trouves && trouves.q === recherche.trim() ? trouves.resultats : null;
  const proposes = (resultats ?? []).filter((r) => r.niveau !== 'section').slice(0, RESULTATS_MONTRES);

  const choisir = (code: string) => {
    if (!coches.includes(code)) void basculer(code, true);
    setRecherche('');
    setTrouves(null);
    setOuvert(false);
    champ.current?.focus();
  };

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!proposes.length) return;
      setOuvert(true);
      setActif((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + proposes.length) % proposes.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = proposes[actif];
      if (r && !coches.includes(r.code)) choisir(r.code);
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  };

  // --- L'arborescence, chargée à la première ouverture -------------------------
  const ouvrirArbre = async () => {
    const suivant = !parcourir;
    setParcourir(suivant);
    if (!suivant || arbre) return;
    setArbreEnErreur(null);
    try {
      const reponse = await fetch('/api/secteurs/nomenclature');
      const lu = (await reponse.json().catch(() => null)) as { lignes?: LigneNaf[]; erreur?: string } | null;
      if (!reponse.ok || !lu?.lignes) {
        setArbreEnErreur(lu?.erreur ?? 'La liste des secteurs n’a pas pu être chargée.');
        return;
      }
      setArbre(construireArbre(lu.lignes));
    } catch {
      setArbreEnErreur('Le serveur ne répond pas. La liste des secteurs n’a pas pu être chargée.');
    }
  };

  const deplier = (code: string) =>
    setDeplies((d) => {
      const suite = new Set(d);
      if (suite.has(code)) suite.delete(code);
      else suite.add(code);
      return suite;
    });

  const occupe = etat.sorte === 'envoi';

  return (
    <details className="bloc decompte-section" open>
      <summary className="decompte-tete">
        <h2>Secteurs représentés</h2>
        <span className={`decompte-date${ancienne ? ' decompte-date--ancienne' : ''}`}>
          {dateDeLaListe(liste.maj_le)}
        </span>
      </summary>

      <p className="secteurs-aide">
        Les secteurs d’activité où travaillent des membres de la loge — sans nom ni nombre. C’est ce
        qui permettra de trouver, pour un candidat, les loges qui peuvent l’aider.
      </p>

      <div className="secteurs" ref={racine}>
        {liste.secteurs.length === 0 ? (
          <p className="secteurs-vide">Aucun secteur coché pour l’instant.</p>
        ) : (
          rangerParSection(liste.secteurs).map((g) => (
            <div className="coches-section" key={g.section}>
              <p className="coches-section-titre">
                <span className="secteur-code">{g.section}</span>
                {g.section_intitule}
              </p>
              <ul className="coches">
                {g.secteurs.map((s) => (
                  <li className="coche" key={s.code}>
                    <span className="secteur-texte">
                      <strong>
                        <span className="secteur-code">{s.code}</span>
                        {s.intitule}
                      </strong>
                      <small>
                        {s.niveau === 'division'
                          ? 'division'
                          : `${NOM_DU_NIVEAU[s.niveau]} · dans ${s.division} — ${s.division_intitule}`}
                      </small>
                    </span>
                    {liste.modifiable && (
                      <button
                        type="button"
                        className="secteur-geste"
                        onClick={() => void basculer(s.code, false)}
                        disabled={occupe}
                        title="Décocher"
                        aria-label={`Décocher ${s.intitule}`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {liste.secteurs.length > 0 && <p className="decompte-total">{resumeDeLaListe(liste.secteurs)}</p>}

        {etat.sorte === 'erreur' && (
          <p className="erreur" role="alert">
            {etat.message}
          </p>
        )}

        {!liste.modifiable ? (
          <p className="decompte-total">Tenu par le Secrétaire de la loge.</p>
        ) : (
          <>
            <div className="secteurs-ajout">
              <input
                ref={champ}
                type="search"
                value={recherche}
                onChange={(e) => {
                  setRecherche(e.target.value);
                  setOuvert(true);
                }}
                onFocus={() => setOuvert(true)}
                onKeyDown={auClavier}
                autoComplete="off"
                role="combobox"
                aria-expanded={ouvert && resultats !== null}
                aria-controls="secteurs-loge-propositions"
                aria-label="Chercher un secteur à cocher"
                placeholder="Cocher un secteur : tapez un mot ou un code (maçonnerie, restauration, 43.21…)"
              />
              {ouvert && resultats !== null && (
                <ul className="secteurs-resultats" role="listbox" id="secteurs-loge-propositions">
                  {proposes.length === 0 ? (
                    <li className="rien">
                      Aucun secteur ne correspond à «&nbsp;{recherche.trim()}&nbsp;». Essayez un mot qui
                      décrit l’activité — «&nbsp;installation électrique&nbsp;» plutôt que
                      «&nbsp;électricien&nbsp;» — ou parcourez la liste.
                    </li>
                  ) : (
                    <>
                      {proposes.map((r, k) => {
                        const pris = coches.includes(r.code);
                        return (
                          <li
                            key={r.code}
                            role="option"
                            aria-selected={k === actif}
                            aria-disabled={pris || undefined}
                            className={pris ? 'deja' : undefined}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => !pris && choisir(r.code)}
                          >
                            <span className="secteur-code">{r.code}</span>
                            <span className="secteur-texte">
                              <strong>
                                {r.intitule}
                                {pris ? ' — déjà coché' : ''}
                              </strong>
                              <small>
                                {NOM_DU_NIVEAU[r.niveau]} · {r.section} — {r.section_intitule}
                              </small>
                            </span>
                          </li>
                        );
                      })}
                      <li className="rien">
                        Pas ce que vous cherchez&nbsp;? Décrivez l’activité plutôt que le métier, ou
                        parcourez la liste.
                      </li>
                    </>
                  )}
                </ul>
              )}
            </div>

            <div className="secteurs-liens">
              <button type="button" onClick={() => void ouvrirArbre()} aria-expanded={parcourir}>
                {parcourir ? 'Fermer la liste' : 'Parcourir toute la liste et cocher'}
              </button>
            </div>

            {parcourir && arbreEnErreur && (
              <p className="erreur" role="alert">
                {arbreEnErreur}
              </p>
            )}
            {parcourir && !arbre && !arbreEnErreur && <p className="secteurs-vide">Chargement de la liste…</p>}
            {parcourir && arbre && (
              <ul className="arbre" aria-label="Les secteurs, du grand secteur à la sous-classe">
                {arbre.sections.map((l) => (
                  <Noeud
                    key={l[0]}
                    ligne={l}
                    arbre={arbre}
                    coches={coches}
                    deplies={deplies}
                    deplier={deplier}
                    basculer={(code, coche) => void basculer(code, coche)}
                    occupe={occupe}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className={`secteurs-enregistre${enregistre ? ' secteurs-enregistre--visible' : ''}`} role="status" aria-live="polite">
        {enregistre ? 'Enregistré' : ''}
      </div>
    </details>
  );
}

/** Une ligne de l'arborescence, et ses enfants quand elle est dépliée. */
function Noeud({
  ligne,
  arbre,
  coches,
  deplies,
  deplier,
  basculer,
  occupe,
}: {
  ligne: LigneNaf;
  arbre: Arbre;
  coches: string[];
  deplies: Set<string>;
  deplier: (code: string) => void;
  basculer: (code: string, coche: boolean) => void;
  occupe: boolean;
}) {
  const [code, intitule, niveau] = ligne;
  const enfants = arbre.enfants.get(code) ?? [];
  const deplie = deplies.has(code);
  const dessous = cochesDessous(ligne, coches, arbre);

  return (
    <li>
      <div className={`arbre-ligne arbre-ligne--n${niveau}`}>
        {enfants.length > 0 ? (
          <button
            type="button"
            className="arbre-bascule"
            onClick={() => deplier(code)}
            aria-expanded={deplie}
            aria-label={`${deplie ? 'Replier' : 'Déplier'} ${intitule}`}
          >
            {deplie ? '▾' : '▸'}
          </button>
        ) : (
          <span className="arbre-bascule" aria-hidden="true" />
        )}
        <label>
          {/* On ne coche pas une section seule : trop large pour dire une loge. */}
          {niveau > 1 && (
            <input
              type="checkbox"
              checked={coches.includes(code)}
              disabled={occupe}
              onChange={(e) => basculer(code, e.target.checked)}
            />
          )}
          <span className="secteur-code">{code}</span>
          <span>{intitule}</span>
        </label>
        {dessous > 0 && (
          <span className="arbre-compte">
            {dessous} coché{dessous > 1 ? 's' : ''} dessous
          </span>
        )}
      </div>
      {deplie && enfants.length > 0 && (
        <ul>
          {enfants.map((e) => (
            <Noeud
              key={e[0]}
              ligne={e}
              arbre={arbre}
              coches={coches}
              deplies={deplies}
              deplier={deplier}
              basculer={basculer}
              occupe={occupe}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
