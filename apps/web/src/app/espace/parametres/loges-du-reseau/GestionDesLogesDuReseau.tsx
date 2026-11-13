'use client';

import { useEffect, useRef, useState } from 'react';
import Ecusson from '@/components/Ecusson';
import {
  DUREE_DU_LIEN_JOURS,
  aEnvoyerEnGroupe,
  composerLeCourriel,
  compter,
  dateEnLettres,
  etatDeLaLoge,
  filtrerLoges,
  libelleDeLEnvoiGroupe,
  libelleDeLEtat,
  nomDansLeCourriel,
  TAILLE_MAXIMALE_ECUSSON,
  type EtatDeLaLoge,
  type LogeDuReseau,
  type ModeleDuCourriel,
} from '@/lib/loges-du-reseau';

/**
 * La rubrique Paramètres › Loges du réseau, telle que la maquette validée le
 * 13 novembre 2026 la dessine (docs/maquettes/loges-du-reseau.html, écran 2) :
 * compteurs, envoi groupé, filtres, ajout, une ligne par loge qui s'ouvre pour
 * la corriger, et le courriel avec son aperçu.
 *
 * Chaque changement s'enregistre aussitôt. Chaque réponse du serveur rend la
 * liste entière, que l'écran affiche telle quelle : il ne garde jamais pour
 * vraie une liste qu'il croit avoir envoyée.
 */

type Province = { id: string; nom: string };
type Filtre = 'toutes' | EtatDeLaLoge;

const FILTRES: [Filtre, string][] = [
  ['toutes', 'Toutes'],
  ['sans', 'Pas de lien'],
  ['envoye', 'À relancer'],
  ['expire', 'Lien expiré'],
  ['repondu', 'Ont répondu'],
];

const API = '/api/parametres/loges-du-reseau';
const DELAI_COURRIEL = 600;

type Reponse = {
  loges?: LogeDuReseau[];
  id?: string;
  envoyes?: number;
  echecs?: number;
  erreur?: string | null;
};

/** L'adresse de l'écusson d'une loge, avec sa version : un écusson remplacé se recharge. */
const adresseDeLEcusson = (loge: LogeDuReseau, version: number) =>
  loge.a_un_ecusson ? `/espace/parametres/loges-du-reseau/${loge.id}/ecusson?v=${version}` : null;

export default function GestionDesLogesDuReseau({
  initiales,
  provinces,
  courriel,
  origine,
}: {
  initiales: LogeDuReseau[];
  provinces: Province[];
  courriel: ModeleDuCourriel;
  origine: string;
}) {
  const [loges, setLoges] = useState(initiales);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [recherche, setRecherche] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mot, setMot] = useState<string | null>(null);
  // Une version par loge : après un dépôt, l'adresse de l'écusson change, et
  // le navigateur ne ressert pas l'ancien.
  const [versions, setVersions] = useState<Record<string, number>>({});
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dire = (texte: string) => {
    setMot(texte);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setMot(null), 1600);
  };
  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
  }, []);

  /** Un appel au serveur ; rend la réponse lue, ou null après avoir dit l'erreur. */
  async function appeler(adresse: string, methode: string, corps?: unknown): Promise<Reponse | null> {
    setOccupe(true);
    setErreur(null);
    try {
      const fichier = corps instanceof FormData;
      const reponse = await fetch(adresse, {
        method: methode,
        headers: corps === undefined || fichier ? undefined : { 'Content-Type': 'application/json' },
        body: corps === undefined ? undefined : fichier ? corps : JSON.stringify(corps),
      });
      const lu = (await reponse.json().catch(() => null)) as Reponse | null;
      if (lu?.loges) setLoges(lu.loges);
      if (!reponse.ok || !lu?.loges) {
        setErreur(lu?.erreur ?? 'L’enregistrement a échoué. Réessayez.');
        return null;
      }
      return lu;
    } catch {
      setErreur('Le serveur ne répond pas. Ce changement n’est pas enregistré.');
      return null;
    } finally {
      setOccupe(false);
    }
  }

  // --- Les gestes -------------------------------------------------------------
  /** Déposer un écusson ; rend vrai s'il est en place. */
  const deposerLEcusson = async (id: string, fichier: File): Promise<boolean> => {
    if (fichier.size > TAILLE_MAXIMALE_ECUSSON) {
      setErreur('Cette image dépasse 5 Mo.');
      return false;
    }
    const corps = new FormData();
    corps.append('ecusson', fichier);
    if (!(await appeler(`${API}/${id}/ecusson`, 'POST', corps))) return false;
    setVersions((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
    return true;
  };

  const ajouter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulaire = e.currentTarget;
    const champs = new FormData(formulaire);
    const ecusson = champs.get('ecusson');
    const lu = await appeler(API, 'POST', {
      nom: String(champs.get('nom') ?? ''),
      numero: String(champs.get('numero') ?? ''),
      province_id: String(champs.get('province_id') ?? '') || null,
      secretaire_nom: String(champs.get('secretaire_nom') ?? ''),
      secretaire_email: String(champs.get('secretaire_email') ?? ''),
    });
    if (!lu) return;
    formulaire.reset();
    // L'écusson, s'il a été choisi, se dépose une fois la loge créée.
    if (lu.id && ecusson instanceof File && ecusson.size > 0) {
      if (await deposerLEcusson(lu.id, ecusson)) dire('Loge ajoutée, avec son écusson');
      return;
    }
    dire('Loge ajoutée');
  };

  const envoyerA = async (id: string) => {
    if (await appeler(`${API}/${id}/lien`, 'POST')) dire('Lien envoyé');
  };

  const envoyerEnGroupe = async () => {
    const lu = await appeler(`${API}/liens`, 'POST');
    if (!lu) return;
    const envoyes = lu.envoyes ?? 0;
    if (lu.echecs) {
      setErreur(
        `${envoyes} lien${envoyes > 1 ? 's' : ''} envoyé${envoyes > 1 ? 's' : ''}, ${lu.echecs} en échec. ${lu.erreur ?? ''}`.trim(),
      );
    }
    if (envoyes) dire(`${envoyes} lien${envoyes > 1 ? 's' : ''} envoyé${envoyes > 1 ? 's' : ''}`);
  };

  const corriger = async (id: string, champs: ChampsSaisis) => {
    if (await appeler(`${API}/${id}`, 'PATCH', champs)) dire('Enregistré');
  };

  const retirer = async (id: string) => {
    if (await appeler(`${API}/${id}`, 'DELETE')) {
      setOuverte(null);
      dire('Loge retirée');
    }
  };

  // --- Ce qui s'affiche ---------------------------------------------------------
  const n = compter(loges);
  const aEnvoyer = aEnvoyerEnGroupe(loges).length;
  const visibles = filtrerLoges(loges, filtre, recherche);

  return (
    <div className="reseau">
      <div className="reseau-compteurs">
        {(
          [
            [n.total, 'loges saisies'],
            [n.repondu, 'ont répondu'],
            [n.envoye, 'lien envoyé, sans réponse'],
            [n.expire, 'lien expiré'],
            [n.sans, 'sans lien'],
          ] as const
        ).map(([k, texte]) => (
          <div className="reseau-compteur" key={texte}>
            <strong>{k}</strong>
            <span>{texte}</span>
          </div>
        ))}
      </div>

      <div className="reseau-actions">
        <button
          type="button"
          className="bouton bouton--fort"
          onClick={() => void envoyerEnGroupe()}
          disabled={aEnvoyer === 0 || occupe}
        >
          {libelleDeLEnvoiGroupe(aEnvoyer)}
        </button>
        <div className="reseau-filtres" role="group" aria-label="Filtrer les loges du réseau">
          {FILTRES.map(([cle, texte]) => (
            <button key={cle} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
              {texte}
            </button>
          ))}
        </div>
        <input
          className="recherche reseau-chercher"
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher une loge, un numéro, un Secrétaire…"
          aria-label="Chercher une loge du réseau"
        />
      </div>

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      <form className="reseau-ajout" onSubmit={(e) => void ajouter(e)}>
        <input name="nom" placeholder="Nom de la loge" aria-label="Nom de la loge" required maxLength={160} />
        <input name="numero" placeholder="N°" aria-label="Numéro" maxLength={20} />
        <select name="province_id" aria-label="Province" defaultValue="">
          <option value="">Province…</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
        <input name="secretaire_nom" placeholder="Nom du Secrétaire" aria-label="Nom du Secrétaire" maxLength={160} />
        <input
          name="secretaire_email"
          type="email"
          placeholder="Adresse du Secrétaire"
          aria-label="Adresse électronique du Secrétaire"
          maxLength={254}
        />
        <button className="bouton bouton--fort" type="submit" disabled={occupe}>
          Ajouter
        </button>
        <label className="reseau-ajout-ecusson">
          Écusson <span className="maigre">(facultatif)</span>
          <input name="ecusson" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" />
        </label>
        <div className="reseau-ajout-pied">
          <small>Le lien ne part pas tout seul : envoyez-le quand la fiche est complète.</small>
        </div>
      </form>

      <ul className="reseau-liste">
        {visibles.length === 0 ? (
          <li className="secteurs-vide reseau-vide">
            {loges.length === 0 ? 'Aucune loge du réseau saisie pour l’instant.' : 'Aucune loge ne correspond.'}
          </li>
        ) : (
          visibles.map((l) => (
            <LigneDeLaLoge
              key={l.id}
              loge={l}
              ecusson={adresseDeLEcusson(l, versions[l.id] ?? 0)}
              deposer={(fichier) => void deposerLEcusson(l.id, fichier).then((ok) => ok && dire('Écusson déposé'))}
              provinces={provinces}
              ouverte={ouverte === l.id}
              basculer={() => setOuverte(ouverte === l.id ? null : l.id)}
              envoyer={() => void envoyerA(l.id)}
              corriger={(champs) => void corriger(l.id, champs)}
              retirer={() => void retirer(l.id)}
              occupe={occupe}
            />
          ))
        )}
      </ul>

      <ReglageDuCourriel initial={courriel} premiere={loges[0] ?? null} origine={origine} dire={dire} />

      <div className={`secteurs-enregistre${mot ? ' secteurs-enregistre--visible' : ''}`} role="status" aria-live="polite">
        {mot ?? ''}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type ChampsSaisis = {
  nom: string;
  numero: string;
  province_id: string | null;
  secretaire_nom: string;
  secretaire_email: string;
};

const champsDe = (l: LogeDuReseau): ChampsSaisis => ({
  nom: l.nom,
  numero: l.numero ?? '',
  province_id: l.province_id,
  secretaire_nom: l.secretaire_nom ?? '',
  secretaire_email: l.secretaire_email ?? '',
});

/** Une loge du réseau : sa ligne, et — ouverte — ses champs, son lien, ses secteurs. */
function LigneDeLaLoge({
  loge,
  ecusson,
  deposer,
  provinces,
  ouverte,
  basculer,
  envoyer,
  corriger,
  retirer,
  occupe,
}: {
  loge: LogeDuReseau;
  /** L'adresse de l'écusson, ou `null` : l'initiale le remplace. */
  ecusson: string | null;
  deposer: (fichier: File) => void;
  provinces: Province[];
  ouverte: boolean;
  basculer: () => void;
  envoyer: () => void;
  corriger: (champs: ChampsSaisis) => void;
  retirer: () => void;
  occupe: boolean;
}) {
  const etat = etatDeLaLoge(loge);
  const [champs, setChamps] = useState<ChampsSaisis>(() => champsDe(loge));

  /** Enregistrer, si quelque chose a changé depuis la fiche reçue. */
  const enregistrer = (suite: ChampsSaisis) => {
    const avant = champsDe(loge);
    if (JSON.stringify(suite) !== JSON.stringify(avant)) corriger(suite);
  };
  const saisir = (cle: keyof ChampsSaisis) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setChamps((c) => ({ ...c, [cle]: e.target.value }));

  return (
    <li className="reseau-ligne">
      <div className="reseau-ligne-tete">
        <Ecusson src={ecusson} nom={loge.nom} />
        <span className="reseau-numero">{loge.numero ?? '—'}</span>
        <span className="reseau-nom">
          <strong>{loge.nom}</strong>
          <small>
            {[loge.province, loge.secretaire_nom ?? 'Secrétaire non renseigné', loge.secretaire_email]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </span>
        <span className="reseau-gestes">
          <span className={`reseau-etat reseau-etat--${etat}`}>{libelleDeLEtat(loge)}</span>
          {loge.secretaire_email ? (
            <button type="button" className="bouton bouton--petit" onClick={envoyer} disabled={occupe}>
              {loge.lien_envoye_le ? 'Renvoyer le lien' : 'Envoyer le lien'}
            </button>
          ) : (
            <span className="reseau-manque">adresse manquante</span>
          )}
          <button
            type="button"
            className="secteur-geste"
            onClick={basculer}
            aria-expanded={ouverte}
            title={ouverte ? 'Refermer' : 'Corriger, voir les secteurs'}
            aria-label={ouverte ? `Refermer ${loge.nom}` : `Ouvrir ${loge.nom}`}
          >
            {ouverte ? '▴' : '▾'}
          </button>
        </span>
      </div>

      {ouverte && (
        <div className="reseau-detail">
          <div className="reseau-champs">
            <label>
              Nom
              <input value={champs.nom} onChange={saisir('nom')} onBlur={() => enregistrer(champs)} required maxLength={160} />
            </label>
            <label>
              Numéro
              <input value={champs.numero} onChange={saisir('numero')} onBlur={() => enregistrer(champs)} maxLength={20} />
            </label>
            <label>
              Province
              <select
                value={champs.province_id ?? ''}
                onChange={(e) => {
                  const suite = { ...champs, province_id: e.target.value || null };
                  setChamps(suite);
                  enregistrer(suite);
                }}
              >
                <option value="">—</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Secrétaire
              <input
                value={champs.secretaire_nom}
                onChange={saisir('secretaire_nom')}
                onBlur={() => enregistrer(champs)}
                maxLength={160}
              />
            </label>
            <label>
              Adresse du Secrétaire
              <input
                type="email"
                value={champs.secretaire_email}
                onChange={saisir('secretaire_email')}
                onBlur={() => enregistrer(champs)}
                maxLength={254}
              />
            </label>
          </div>

          <div className="reseau-ecusson">
            <Ecusson src={ecusson} nom={loge.nom} taille="grand" />
            <label>
              {loge.a_un_ecusson ? 'Remplacer l’écusson' : 'Déposer un écusson'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                disabled={occupe}
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  if (fichier) deposer(fichier);
                  e.target.value = '';
                }}
              />
            </label>
            <small className="maigre">JPEG, PNG, WebP, GIF ou AVIF, 5 Mo au plus.</small>
          </div>

          <p className="reseau-historique">
            {loge.lien_envoye_le && loge.lien_expire_le
              ? `Lien envoyé le ${dateEnLettres(loge.lien_envoye_le)} — valable jusqu’au ${dateEnLettres(loge.lien_expire_le)}.`
              : 'Aucun lien envoyé.'}
            {loge.secteurs_maj_le ? ` Dernière modification de la liste : ${dateEnLettres(loge.secteurs_maj_le)}.` : ''}
          </p>

          {loge.secteurs.length > 0 ? (
            <div className="reseau-secteurs">
              {loge.secteurs.map((s) => (
                <span key={s.code}>
                  {s.code} — {s.intitule}
                </span>
              ))}
            </div>
          ) : (
            <p className="reseau-historique">Aucun secteur coché.</p>
          )}

          <p className="reseau-historique">
            Changer l’adresse du Secrétaire n’envoie rien : renvoyez le lien au nouveau Secrétaire.
            L’ancien lien cesse alors de valoir.
          </p>
          <button type="button" className="reseau-retirer" onClick={retirer} disabled={occupe}>
            Retirer cette loge du réseau
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

/** Le courriel envoyé aux Secrétaires : objet, texte, aperçu. Enregistré aussitôt. */
function ReglageDuCourriel({
  initial,
  premiere,
  origine,
  dire,
}: {
  initial: ModeleDuCourriel;
  premiere: LogeDuReseau | null;
  origine: string;
  dire: (texte: string) => void;
}) {
  const [modele, setModele] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  // La date de fin d'un lien qui partirait aujourd'hui, calculée une fois.
  const [finExemple] = useState(() =>
    dateEnLettres(new Date(Date.now() + DUREE_DU_LIEN_JOURS * 86_400_000)),
  );
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changer = (suite: ModeleDuCourriel) => {
    setModele(suite);
    if (attente.current) clearTimeout(attente.current);
    attente.current = setTimeout(async () => {
      try {
        const reponse = await fetch(`${API}/courriel`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(suite),
        });
        const lu = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
        if (!reponse.ok) {
          setErreur(lu?.erreur ?? 'Le courriel n’a pas pu être enregistré.');
          return;
        }
        setErreur(null);
        dire('Enregistré');
      } catch {
        setErreur('Le serveur ne répond pas. Le courriel n’est pas enregistré.');
      }
    }, DELAI_COURRIEL);
  };
  useEffect(() => () => {
    if (attente.current) clearTimeout(attente.current);
  }, []);

  const exemple = premiere ?? { nom: 'Nom de la loge', numero: null, secretaire_nom: 'Nom du Secrétaire' };
  const apercu = composerLeCourriel(modele, {
    secretaire: exemple.secretaire_nom,
    loge: nomDansLeCourriel(exemple),
    lien: `${origine}/loge-du-reseau/•••••••••`,
    expiration: finExemple,
  });

  return (
    <section className="courriel" aria-labelledby="titre-courriel">
      <h2 id="titre-courriel">Le courriel envoyé aux Secrétaires</h2>
      <p className="aide courriel-chapo">Une première version, à reprendre à votre goût. Chaque changement s’enregistre aussitôt.</p>
      <label>
        Objet
        <input value={modele.objet} onChange={(e) => changer({ ...modele, objet: e.target.value })} maxLength={200} />
      </label>
      <label>
        Texte
        <textarea value={modele.texte} onChange={(e) => changer({ ...modele, texte: e.target.value })} maxLength={5000} />
      </label>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      <p className="courriel-variables">
        Remplacés à l’envoi : <code>{'{secretaire}'}</code> le nom du Secrétaire · <code>{'{loge}'}</code> le nom et le
        numéro de la loge · <code>{'{lien}'}</code> son lien personnel · <code>{'{expiration}'}</code> la date jusqu’à
        laquelle il vaut.
      </p>
      <div>
        <p className="courriel-variables courriel-variables--titre">Aperçu, pour la première loge de la liste :</p>
        <div className="courriel-apercu">
          <strong>{apercu.sujet}</strong>
          {apercu.texte}
        </div>
      </div>
    </section>
  );
}
