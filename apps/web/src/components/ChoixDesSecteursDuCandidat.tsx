'use client';

import { useEffect, useRef, useState } from 'react';
import {
  SECTEURS_PAR_CANDIDAT,
  type LigneNaf,
  type SecteurDuCandidat,
  type SecteurTrouve,
} from '@/lib/secteurs';

/**
 * Les secteurs d'activité que cherche un candidat — jusqu'à trois, classés, le
 * premier étant le principal (maquette validée le 12 novembre 2026,
 * docs/maquettes/secteurs-d-activite.html, écrans 1 et 2).
 *
 * Un composant, trois usages :
 *
 *   · « candidat » — dans le formulaire de candidature. Le choix part avec la
 *     fiche : le composant le garde, et l'écrit dans un champ caché.
 *   · « referent » — sur la fiche, pour son référent ou son parrain. Chaque
 *     geste s'enregistre aussitôt (`enregistrer`, `confirmer`) ; la liste
 *     affichée est celle que la base a rendue. Ce qu'il ajoute est confirmé
 *     d'office ; un secteur proposé par le candidat attend son « Confirmer ».
 *   · « lecture » — sur la fiche, pour les autres référents de la loge.
 *
 * Un secteur est une section (« F — Construction ») ou une division
 * (« 43 — Travaux de construction spécialisés »). On le trouve par un mot ou
 * un code, ou en parcourant la liste.
 */

type Mode = 'candidat' | 'referent' | 'lecture';

/** Ce que le composant sait d'un secteur choisi. */
type Choisi = Pick<SecteurDuCandidat, 'code' | 'intitule' | 'niveau' | 'section' | 'section_intitule'> &
  Partial<Pick<SecteurDuCandidat, 'propose_par' | 'confirme_le' | 'confirme_par'>>;

const DELAI_RECHERCHE = 250;
const RESULTATS_MONTRES = 8;

export default function ChoixDesSecteursDuCandidat({
  mode,
  initiale,
  adresses,
  enregistrer,
  confirmer,
  nomDuChamp,
  idDuTitre,
}: {
  mode: Mode;
  initiale: SecteurDuCandidat[];
  /** GET ?q= → { resultats } ; GET → { lignes } (sections et divisions). */
  adresses: { recherche: string; liste: string };
  /** Sur la fiche : enregistrer la liste voulue, dans l'ordre ; rend la liste retenue, ou un message. */
  enregistrer?: (codes: string[]) => Promise<SecteurDuCandidat[] | string>;
  /** Sur la fiche : confirmer un secteur proposé par le candidat. */
  confirmer?: (code: string) => Promise<SecteurDuCandidat[] | string>;
  /** Dans le formulaire : le champ caché qui porte les codes choisis, en JSON. */
  nomDuChamp?: string;
  idDuTitre?: string;
}) {
  const [choisis, setChoisis] = useState<Choisi[]>(initiale);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mot, setMot] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [trouves, setTrouves] = useState<{ q: string; resultats: SecteurTrouve[] } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);

  const [parcourir, setParcourir] = useState(false);
  const [liste, setListe] = useState<LigneNaf[] | null>(null);
  const [listeEnErreur, setListeEnErreur] = useState<string | null>(null);
  const [sectionOuverte, setSectionOuverte] = useState<string | null>(null);

  const racine = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enLecture = mode === 'lecture';
  const plein = choisis.length >= SECTEURS_PAR_CANDIDAT;
  const deja = (code: string) => choisis.some((c) => c.code === code);

  const dire = (texte: string) => {
    setMot(texte);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setMot(null), 1400);
  };
  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
  }, []);

  /** Poser une nouvelle liste : tout de suite à l'écran, puis — sur la fiche — en base. */
  async function poser(suite: Choisi[]) {
    const avant = choisis;
    setChoisis(suite);
    setErreur(null);
    if (!enregistrer) return;
    setOccupe(true);
    const reponse = await enregistrer(suite.map((c) => c.code));
    setOccupe(false);
    if (typeof reponse === 'string') {
      setChoisis(avant);
      setErreur(reponse);
      return;
    }
    setChoisis(reponse);
    dire('Enregistré');
  }

  async function confirmerUn(code: string) {
    if (!confirmer) return;
    setOccupe(true);
    setErreur(null);
    const reponse = await confirmer(code);
    setOccupe(false);
    if (typeof reponse === 'string') {
      setErreur(reponse);
      return;
    }
    setChoisis(reponse);
    dire('Confirmé');
  }

  const ajouter = (s: Choisi) => {
    if (deja(s.code) || plein) return;
    void poser([...choisis, s]);
    setRecherche('');
    setTrouves(null);
    setOuvert(false);
    champ.current?.focus();
  };

  const deplacer = (i: number, vers: -1 | 1) => {
    const suite = [...choisis];
    [suite[i], suite[i + vers]] = [suite[i + vers], suite[i]];
    void poser(suite);
  };

  // --- La recherche ---------------------------------------------------------
  useEffect(() => {
    const q = recherche.trim();
    if (!q) return;
    const abandon = new AbortController();
    const attente = setTimeout(async () => {
      try {
        const reponse = await fetch(`${adresses.recherche}?q=${encodeURIComponent(q)}`, { signal: abandon.signal });
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
  }, [recherche, adresses.recherche]);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  const resultats = trouves && trouves.q === recherche.trim() ? trouves.resultats : null;
  const proposes = (resultats ?? [])
    .filter((r) => r.niveau === 'section' || r.niveau === 'division')
    .slice(0, RESULTATS_MONTRES);

  const versChoisi = (r: SecteurTrouve): Choisi => ({
    code: r.code,
    intitule: r.intitule,
    niveau: r.niveau as 'section' | 'division',
    section: r.section,
    section_intitule: r.section_intitule,
  });

  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!proposes.length) return;
      setOuvert(true);
      setActif((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + proposes.length) % proposes.length);
    } else if (e.key === 'Enter') {
      // Dans le formulaire de candidature, Entrée ne doit pas envoyer la fiche.
      e.preventDefault();
      const r = proposes[actif];
      if (r && !deja(r.code)) ajouter(versChoisi(r));
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  };

  // --- Parcourir la liste ------------------------------------------------------
  const ouvrirLaListe = async () => {
    const suivant = !parcourir;
    setParcourir(suivant);
    if (!suivant || liste) return;
    setListeEnErreur(null);
    try {
      const reponse = await fetch(adresses.liste);
      const lu = (await reponse.json().catch(() => null)) as { lignes?: LigneNaf[]; erreur?: string } | null;
      if (!reponse.ok || !lu?.lignes) {
        setListeEnErreur(lu?.erreur ?? 'La liste des secteurs n’a pas pu être chargée.');
        return;
      }
      setListe(lu.lignes);
    } catch {
      setListeEnErreur('Le serveur ne répond pas. La liste des secteurs n’a pas pu être chargée.');
    }
  };

  const sections = (liste ?? []).filter((l) => l[2] === 1);
  const sectionChoisie = sections.find((l) => l[0] === sectionOuverte) ?? null;
  const divisions = (liste ?? []).filter((l) => l[2] === 2 && l[3] === sectionOuverte);
  const depuisLaListe = (l: LigneNaf): Choisi => {
    const s = l[2] === 1 ? l : sections.find((x) => x[0] === l[3]);
    return {
      code: l[0],
      intitule: l[1],
      niveau: l[2] === 1 ? 'section' : 'division',
      section: s?.[0] ?? l[0],
      section_intitule: s?.[1] ?? l[1],
    };
  };

  // --- Ce qui s'affiche ----------------------------------------------------------
  return (
    <div className="secteurs" ref={racine} role="group" aria-labelledby={idDuTitre}>
      {nomDuChamp && <input type="hidden" name={nomDuChamp} value={JSON.stringify(choisis.map((c) => c.code))} />}

      {!enLecture && (
        <p className="secteurs-aide">
          {mode === 'candidat'
            ? 'Dans quels secteurs cherchez-vous ? Jusqu’à trois, le premier étant votre secteur principal.'
            : 'Jusqu’à trois, le premier est le secteur principal. Ce que vous ajoutez ou modifiez est confirmé d’office.'}
        </p>
      )}

      {choisis.length === 0 ? (
        <p className="secteurs-vide">Aucun secteur choisi.</p>
      ) : (
        <ol className="secteurs-choisis">
          {choisis.map((c, i) => {
            const sous = c.niveau === 'section' ? 'grand secteur, toutes ses divisions' : `${c.section} — ${c.section_intitule}`;
            const statut =
              mode === 'candidat' ? null : c.confirme_le ? (
                <span className="confirme">✓ confirmé{c.confirme_par ? ` par ${c.confirme_par}` : ''}</span>
              ) : (
                <>
                  <span className="a-confirmer">
                    {c.propose_par === 'reprise' ? 'repris de Bubble' : 'proposé par le candidat'} · à confirmer
                  </span>
                  {mode === 'referent' && (
                    <button type="button" className="confirmer" onClick={() => void confirmerUn(c.code)} disabled={occupe}>
                      Confirmer
                    </button>
                  )}
                </>
              );
            return (
              <li className="secteur-choisi" key={c.code}>
                <span className="secteur-rang" aria-label={`Rang ${i + 1}`}>
                  {i + 1}
                </span>
                <span className="secteur-texte">
                  <strong>
                    <span className="secteur-code">{c.code}</span>
                    {c.intitule}
                    {i === 0 && <span className="secteur-principal">principal</span>}
                  </strong>
                  <small>{sous}</small>
                </span>
                {enLecture ? (
                  <span />
                ) : (
                  <span className="secteur-gestes">
                    <button type="button" className="secteur-geste" onClick={() => deplacer(i, -1)} disabled={i === 0 || occupe} title="Monter" aria-label={`Monter ${c.intitule}`}>
                      ↑
                    </button>
                    <button type="button" className="secteur-geste" onClick={() => deplacer(i, 1)} disabled={i === choisis.length - 1 || occupe} title="Descendre" aria-label={`Descendre ${c.intitule}`}>
                      ↓
                    </button>
                    <button type="button" className="secteur-geste" onClick={() => void poser(choisis.filter((x) => x.code !== c.code))} disabled={occupe} title="Retirer" aria-label={`Retirer ${c.intitule}`}>
                      ✕
                    </button>
                  </span>
                )}
                {statut && <span className="secteur-etat">{statut}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      {!enLecture &&
        (plein ? (
          <p className="secteurs-plein">Trois secteurs au plus : retirez-en un pour en choisir un autre.</p>
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
                aria-controls="secteurs-candidat-propositions"
                aria-label="Chercher un secteur"
                placeholder="Tapez un mot : boulangerie, transport, informatique, 43…"
              />
              {ouvert && resultats !== null && (
                <ul className="secteurs-resultats" role="listbox" id="secteurs-candidat-propositions">
                  {proposes.length === 0 ? (
                    <li className="rien">
                      Aucun secteur ne correspond à «&nbsp;{recherche.trim()}&nbsp;». Essayez un mot qui décrit
                      l’activité de l’entreprise — «&nbsp;restauration&nbsp;» plutôt que «&nbsp;cuisinier&nbsp;» —
                      ou parcourez la liste.
                    </li>
                  ) : (
                    <>
                      {proposes.map((r, k) => {
                        const pris = deja(r.code);
                        return (
                          <li
                            key={r.code}
                            role="option"
                            aria-selected={k === actif}
                            aria-disabled={pris || undefined}
                            className={pris ? 'deja' : undefined}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => !pris && ajouter(versChoisi(r))}
                          >
                            <span className="secteur-code">{r.code}</span>
                            <span className="secteur-texte">
                              <strong>
                                {r.intitule}
                                {pris ? ' — déjà choisi' : ''}
                              </strong>
                              <small>
                                {r.niveau === 'section' ? 'grand secteur' : `${r.section} — ${r.section_intitule}`}
                                {r.trouve_par ? (
                                  <>
                                    {' · trouvé par '}
                                    <em>«&nbsp;{r.trouve_par}&nbsp;»</em>
                                  </>
                                ) : null}
                              </small>
                            </span>
                          </li>
                        );
                      })}
                      <li className="rien">
                        Pas ce que vous cherchez&nbsp;? Décrivez l’activité de l’entreprise plutôt que le métier, ou
                        parcourez la liste.
                      </li>
                    </>
                  )}
                </ul>
              )}
            </div>

            <div className="secteurs-liens">
              <button type="button" onClick={() => void ouvrirLaListe()} aria-expanded={parcourir}>
                {parcourir ? 'Fermer la liste' : 'Parcourir la liste des secteurs'}
              </button>
            </div>

            {parcourir && listeEnErreur && (
              <p className="erreur" role="alert">
                {listeEnErreur}
              </p>
            )}
            {parcourir && !liste && !listeEnErreur && <p className="secteurs-vide">Chargement de la liste…</p>}
            {parcourir && liste && (
              <div className="secteurs-parcourir">
                <ul aria-label="Grands secteurs">
                  {sections.map((s) => (
                    <li key={s[0]}>
                      <button type="button" onClick={() => setSectionOuverte(s[0])} aria-current={s[0] === sectionOuverte}>
                        <span className="secteur-code">{s[0]}</span>
                        <span>{s[1]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <ul aria-label="Divisions">
                  {!sectionChoisie ? (
                    <li className="secteurs-parcourir-indice">Choisissez un grand secteur à gauche.</li>
                  ) : (
                    <>
                      <li>
                        <button type="button" className="tout" onClick={() => ajouter(depuisLaListe(sectionChoisie))} disabled={deja(sectionChoisie[0])}>
                          Tout le secteur «&nbsp;{sectionChoisie[1]}&nbsp;»
                        </button>
                      </li>
                      {divisions.map((d) => (
                        <li key={d[0]}>
                          <button type="button" onClick={() => ajouter(depuisLaListe(d))} disabled={deja(d[0])}>
                            <span className="secteur-code">{d[0]}</span>
                            <span>{d[1]}</span>
                          </button>
                        </li>
                      ))}
                    </>
                  )}
                </ul>
              </div>
            )}
          </>
        ))}

      {mode === 'referent' && (
        <div className={`secteurs-enregistre${mot ? ' secteurs-enregistre--visible' : ''}`} role="status" aria-live="polite">
          {mot ?? ''}
        </div>
      )}
    </div>
  );
}
