'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GABARITS, defauts, type Champ, type DocumentCle, type Ligne, type Reglages, type Valeur } from '@/lib/documents/gabarits';
import { verifier } from '@/lib/documents/reglages';

/**
 * L'éditeur de mise en page : les réglages d'un document à gauche, son aperçu
 * à droite.
 *
 * Chaque changement s'enregistre de lui-même, une demi-seconde après la
 * dernière frappe, puis l'aperçu se recharge. Pas de bouton « Appliquer » ni
 * « Annuler » : ce qu'on voit est ce qui est enregistré, et ce qui est
 * enregistré est ce que la prochaine réunion imprimera. Pour revenir en
 * arrière, chaque ligne a son retour à l'origine, et le document entier aussi.
 *
 * Une valeur fausse — une couleur mal écrite, une taille hors bornes — ne part
 * pas : elle reste à l'écran, signalée, jusqu'à ce qu'elle soit corrigée.
 */

/** Une copie de l'objet, sans cette clé. */
function sans<T>(objet: Record<string, T>, cle: string): Record<string, T> {
  const copie = { ...objet };
  delete copie[cle];
  return copie;
}

type Etat = { sorte: 'pret' } | { sorte: 'envoi' } | { sorte: 'enregistre' } | { sorte: 'erreur'; message: string };

const DELAI = 500;

export default function EditeurDeMiseEnPage({
  document,
  ecartsInitiaux,
}: {
  document: DocumentCle;
  ecartsInitiaux: Reglages;
}) {
  const gabarit = GABARITS[document];
  const origine = useMemo(() => defauts(document), [document]);
  const adresse = `/api/parametres/mise-en-page/${document}`;

  const [ecarts, setEcarts] = useState<Reglages>(ecartsInitiaux);
  // Ce que la personne tape, tel quel : « 1, » n'est pas encore un nombre, et
  // ne doit pas être corrigé sous ses doigts.
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [fautes, setFautes] = useState<Record<string, string>>({});
  const [etat, setEtat] = useState<Etat>({ sorte: 'pret' });
  // Un compteur, et non l'heure : la page rendue par le serveur et celle que
  // le navigateur reprend doivent porter la même adresse d'aperçu.
  const [version, setVersion] = useState(0);
  const [confirmer, setConfirmer] = useState(false);

  const enAttente = useRef<Map<string, Valeur | null>>(new Map());
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  const valeur = (cle: string): Valeur => (cle in ecarts ? ecarts[cle] : origine[cle]);

  const envoyer = useCallback(
    async (corps: object) => {
      setEtat({ sorte: 'envoi' });
      try {
        const reponse = await fetch(adresse, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const lu = (await reponse.json().catch(() => null)) as { ecarts?: Reglages; erreur?: string } | null;
        if (!reponse.ok || !lu?.ecarts) {
          setEtat({ sorte: 'erreur', message: lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.' });
          return;
        }
        setEcarts(lu.ecarts);
        setEtat({ sorte: 'enregistre' });
        setVersion((v) => v + 1);
      } catch {
        setEtat({ sorte: 'erreur', message: 'Le serveur ne répond pas. Vos derniers réglages ne sont pas enregistrés.' });
      }
    },
    [adresse],
  );

  const vider = useCallback(() => {
    minuterie.current = null;
    if (enAttente.current.size === 0) return;
    const valeurs: Record<string, Valeur> = {};
    const retirer: string[] = [];
    for (const [cle, v] of enAttente.current) {
      if (v === null) retirer.push(cle);
      else valeurs[cle] = v;
    }
    enAttente.current.clear();
    void envoyer({ valeurs, retirer });
  }, [envoyer]);

  // Ce qui attend encore part quand on quitte l'onglet ou la page.
  useEffect(() => {
    const partir = () => {
      if (minuterie.current) clearTimeout(minuterie.current);
      vider();
    };
    window.addEventListener('pagehide', partir);
    return () => {
      window.removeEventListener('pagehide', partir);
      partir();
    };
  }, [vider]);

  /** Une valeur change : à l'écran tout de suite, en base une demi-seconde après. */
  const regler = (c: Champ, brute: unknown, texte?: string) => {
    if (texte !== undefined) setBrouillons((b) => ({ ...b, [c.cle]: texte }));
    const verdict = verifier(c, brute);
    if (!verdict.ok) {
      setFautes((f) => ({ ...f, [c.cle]: verdict.erreur }));
      return;
    }
    setFautes((f) => sans(f, c.cle));
    const egaleALOrigine = verdict.valeur === origine[c.cle];
    setEcarts((e) => {
      const suite = { ...e };
      if (egaleALOrigine) delete suite[c.cle];
      else suite[c.cle] = verdict.valeur;
      return suite;
    });
    enAttente.current.set(c.cle, egaleALOrigine ? null : verdict.valeur);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(vider, DELAI);
  };

  /** Une ligne revient à l'origine. */
  const retablirLaLigne = (ligne: Ligne) => {
    const cles = ligne.champs.filter((c) => c.genre !== 'image').map((c) => c.cle);
    setBrouillons((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !cles.includes(k))));
    setFautes((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !cles.includes(k))));
    for (const cle of cles) enAttente.current.delete(cle);
    void envoyer({ valeurs: {}, retirer: cles });
  };

  const toutRetablir = () => {
    if (!confirmer) {
      setConfirmer(true);
      setTimeout(() => setConfirmer(false), 6000);
      return;
    }
    setConfirmer(false);
    enAttente.current.clear();
    setBrouillons({});
    setFautes({});
    void envoyer({ toutRetablir: true });
  };

  const deposer = async (prefixe: string, fichier: File | undefined) => {
    if (!fichier) return;
    setEtat({ sorte: 'envoi' });
    const corps = new FormData();
    corps.set('cle', prefixe);
    corps.set('fichier', fichier);
    const reponse = await fetch(`${adresse}/image`, { method: 'POST', body: corps }).catch(() => null);
    const lu = (await reponse?.json().catch(() => null)) as { erreur?: string } | null;
    if (!reponse?.ok) {
      setEtat({ sorte: 'erreur', message: lu?.erreur ?? 'L’image n’a pas pu être déposée.' });
      return;
    }
    setEcarts((e) => ({ ...e, [`${prefixe}.image`]: 'deposee' }));
    setEtat({ sorte: 'enregistre' });
    setVersion((v) => v + 1);
  };

  const revenirALEmbleme = async (prefixe: string) => {
    setEtat({ sorte: 'envoi' });
    const reponse = await fetch(`${adresse}/image?cle=${encodeURIComponent(prefixe)}`, { method: 'DELETE' }).catch(() => null);
    if (!reponse?.ok) {
      setEtat({ sorte: 'erreur', message: 'L’emblème d’origine n’a pas pu être rétabli.' });
      return;
    }
    setEcarts((e) => sans(e, `${prefixe}.image`));
    setEtat({ sorte: 'enregistre' });
    setVersion((v) => v + 1);
  };

  const modifiee = (ligne: Ligne) => ligne.champs.some((c) => c.genre !== 'image' && c.cle in ecarts);

  return (
    <div className="mise-en-page-deux-volets">
      <div className="mise-en-page-reglages">
        <details className="mise-en-page-section mise-en-page-variables">
          <summary>Variables et mise en forme des textes</summary>
          <p className="aide">
            Entre accolades, une donnée que le document remplit lui-même. Entre deux paires
            d’astérisques, du <strong>**gras**</strong> ; entre deux astérisques, de l’
            <em>*italique*</em>. Un retour à la ligne dans le texte en est un dans le document.
            Une ligne dont toutes les données sont vides ne s’imprime pas.
          </p>
          <dl>
            {gabarit.variables.map((v) => (
              <div key={v.nom}>
                <dt>
                  <code>{`{${v.nom}}`}</code>
                </dt>
                <dd>{v.sens}</dd>
              </div>
            ))}
          </dl>
        </details>

        {gabarit.sections.map((section, rang) => (
          <details key={section.titre} className="mise-en-page-section" open={rang < 2}>
            <summary>{section.titre}</summary>
            {section.aide && <p className="aide">{section.aide}</p>}
            {section.lignes.map((ligne) => (
              <fieldset key={ligne.libelle + ligne.champs[0]?.cle} className="mise-en-page-ligne">
                <legend>
                  {ligne.libelle}
                  {modifiee(ligne) && (
                    <button
                      type="button"
                      className="mise-en-page-retour"
                      onClick={() => retablirLaLigne(ligne)}
                      title="Revenir à la présentation d’origine pour cette ligne"
                    >
                      origine
                    </button>
                  )}
                </legend>
                {ligne.aide && <p className="aide">{ligne.aide}</p>}
                <div className="mise-en-page-champs">
                  {ligne.champs.map((c) => (
                    <ChampDeReglage
                      key={c.cle}
                      champ={c}
                      valeur={valeur(c.cle)}
                      brouillon={brouillons[c.cle]}
                      faute={fautes[c.cle]}
                      regler={regler}
                      document={document}
                      version={version}
                      deposer={deposer}
                      revenirALEmbleme={revenirALEmbleme}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </details>
        ))}

        <div className="mise-en-page-fin">
          <button type="button" className="bouton" onClick={toutRetablir}>
            {confirmer
              ? `Confirmer : revenir à l’original de Bubble pour tout le ${gabarit.libelle.toLowerCase()}`
              : 'Revenir à la présentation d’origine'}
          </button>
          <p className="aide">
            Textes, tailles, couleurs, colonnes et emblèmes reprennent les valeurs des documents
            que produisait Bubble. Les deux autres documents ne bougent pas.
          </p>
        </div>
      </div>

      <aside className="mise-en-page-apercu" aria-label="Aperçu">
        <div className="mise-en-page-etat" role="status" aria-live="polite">
          {etat.sorte === 'envoi' && <span className="maigre">Enregistrement…</span>}
          {etat.sorte === 'enregistre' && <span className="maigre">Enregistré.</span>}
          {etat.sorte === 'erreur' && <span className="mise-en-page-faute">{etat.message}</span>}
          {Object.keys(fautes).length > 0 && etat.sorte !== 'erreur' && (
            <span className="mise-en-page-faute">Une valeur est à corriger : elle n’est pas enregistrée.</span>
          )}
          <a className="mise-en-page-ouvrir" href={`${adresse}/apercu?v=${version}`} target="_blank" rel="noopener">
            Ouvrir l’aperçu
          </a>
        </div>
        <iframe
          key={version}
          className="mise-en-page-cadre"
          src={`${adresse}/apercu?v=${version}#view=FitH`}
          title={`Aperçu — ${gabarit.libelle}, sur des données d’exemple`}
        />
        <p className="aide">Aperçu sur des données d’exemple, inventées.</p>
      </aside>
    </div>
  );
}

function ChampDeReglage({
  champ: c,
  valeur,
  brouillon,
  faute,
  regler,
  document,
  version,
  deposer,
  revenirALEmbleme,
}: {
  champ: Champ;
  valeur: Valeur;
  brouillon: string | undefined;
  faute: string | undefined;
  regler: (c: Champ, brute: unknown, texte?: string) => void;
  document: DocumentCle;
  version: number;
  deposer: (prefixe: string, fichier: File | undefined) => void;
  revenirALEmbleme: (prefixe: string) => void;
}) {
  const id = `reglage-${c.cle.replace(/\./g, '-')}`;
  const classe = `mise-en-page-champ mise-en-page-champ--${c.genre}${faute ? ' mise-en-page-champ--faux' : ''}`;
  const aide = c.aide ? <span className="aide">{c.aide}</span> : null;
  const erreur = faute ? (
    <span className="mise-en-page-faute" role="alert">
      {faute}
    </span>
  ) : null;

  switch (c.genre) {
    case 'texte':
      return (
        <label className={classe} htmlFor={id}>
          <span>{c.libelle}</span>
          {(c.lignes ?? 1) > 1 ? (
            <textarea id={id} rows={c.lignes} value={String(valeur)} onChange={(e) => regler(c, e.target.value)} />
          ) : (
            <input id={id} type="text" value={String(valeur)} onChange={(e) => regler(c, e.target.value)} />
          )}
          {aide}
          {erreur}
        </label>
      );
    case 'nombre':
      return (
        <label className={classe} htmlFor={id} title={c.aide}>
          <span>{c.libelle}</span>
          <span className="mise-en-page-unite">
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={brouillon ?? String(valeur).replace('.', ',')}
              onChange={(e) => regler(c, e.target.value, e.target.value)}
            />
            {c.unite && <span>{c.unite}</span>}
          </span>
          {erreur}
        </label>
      );
    case 'largeur':
      return (
        <label className={classe} htmlFor={id} title={c.aide}>
          <span>{c.libelle}</span>
          <input id={id} type="text" value={brouillon ?? String(valeur)} onChange={(e) => regler(c, e.target.value, e.target.value)} />
          {erreur}
        </label>
      );
    case 'couleur':
      return (
        <label className={classe} htmlFor={id} title={c.aide}>
          <span>{c.libelle}</span>
          <input id={id} type="color" value={String(valeur)} onChange={(e) => regler(c, e.target.value)} />
          {erreur}
        </label>
      );
    case 'choix':
      return (
        <label className={classe} htmlFor={id}>
          <span>{c.libelle}</span>
          <select id={id} value={String(valeur)} onChange={(e) => regler(c, e.target.value)}>
            {c.options?.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </select>
        </label>
      );
    case 'case':
      return (
        <label className={classe} htmlFor={id} title={c.aide}>
          <input id={id} type="checkbox" checked={valeur === true} onChange={(e) => regler(c, e.target.checked)} />
          <span>{c.libelle}</span>
        </label>
      );
    case 'image': {
      const prefixe = c.cle.slice(0, -'.image'.length);
      return (
        <div className={classe}>
          {/* Une vignette, pas une illustration : son texte dit ce qu'elle montre. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/parametres/mise-en-page/${document}/image?cle=${encodeURIComponent(prefixe)}&v=${version}`}
            alt={valeur === 'deposee' ? 'Image déposée' : 'Emblème d’origine'}
          />
          <label className="bouton" htmlFor={id}>
            Remplacer…
          </label>
          <input
            id={id}
            className="mise-en-page-fichier"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              deposer(prefixe, e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {valeur === 'deposee' && (
            <button type="button" className="mise-en-page-retour" onClick={() => revenirALEmbleme(prefixe)}>
              emblème d’origine
            </button>
          )}
        </div>
      );
    }
  }
}
