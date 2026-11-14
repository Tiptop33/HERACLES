'use client';

import { useEffect, useRef, useState } from 'react';
import Ecusson from '@/components/Ecusson';
import ZoneDeDepot, { useGardeDuGlisser } from '@/components/ZoneDeDepot';
import { ACCEPTE_ECUSSON } from '@/lib/depot';
import {
  TAILLE_MAXIMALE_ECUSSON_PROVINCIAL,
  adresseDeLEcusson,
  initialeDeProvince,
  nomAffiche,
  questionDuRetrait,
  type ProvinceAGerer,
} from '@/lib/provinces';

/**
 * L'écran Province, côté administration (migration 0096, décisions du
 * 13 novembre 2026) : le formulaire d'ajout en haut, puis les cartes ; sous
 * chaque carte, un volet qui s'ouvre par ▾ — le nom, l'écusson, le retrait.
 * Le même geste que Paramètres › Loges de Guyenne et Gascogne.
 *
 * Chaque changement s'enregistre aussitôt : le nom en quittant le champ,
 * l'écusson dès qu'il est choisi. Le retrait seul demande confirmation, et
 * dit combien de loges perdront leur province.
 *
 * L'écusson se choisit par « Parcourir », ou se glisse-dépose (demande du
 * 14 novembre 2026) : sur l'image de la carte, sur la zone de l'écusson dans
 * le volet, et sur « Écusson (facultatif) » du formulaire d'ajout.
 *
 * Les droits ne se jouent pas ici : la route les vérifie, la base les redit.
 */

const API = '/api/provinces';

type Reponse = { provinces?: ProvinceAGerer[]; id?: string; erreur?: string };

export default function GestionDesProvinces({ initiales }: { initiales: ProvinceAGerer[] }) {
  const [provinces, setProvinces] = useState(initiales);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mot, setMot] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useGardeDuGlisser();

  const dire = (texte: string) => {
    setMot(texte);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setMot(null), 1600);
  };
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

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
      if (lu?.provinces) setProvinces(lu.provinces);
      if (!reponse.ok || !lu?.provinces) {
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
    if (fichier.size > TAILLE_MAXIMALE_ECUSSON_PROVINCIAL) {
      setErreur('Cette image dépasse 5 Mo.');
      return false;
    }
    const corps = new FormData();
    corps.append('ecusson', fichier);
    return Boolean(await appeler(`${API}/${id}/ecusson`, 'POST', corps));
  };

  const ajouter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulaire = e.currentTarget;
    const champs = new FormData(formulaire);
    const ecusson = champs.get('ecusson');
    const lu = await appeler(API, 'POST', { nom_de_la_province: String(champs.get('nom_de_la_province') ?? '') });
    if (!lu) return;
    formulaire.reset();
    // L'écusson, s'il a été choisi, se dépose une fois la province créée.
    if (lu.id && ecusson instanceof File && ecusson.size > 0) {
      if (await deposerLEcusson(lu.id, ecusson)) dire('Province ajoutée, avec son écusson');
      return;
    }
    dire('Province ajoutée');
  };

  /** Renommer ; rend vrai si le nouveau nom est enregistré. */
  const renommer = async (id: string, nom: string): Promise<boolean> => {
    const ok = Boolean(await appeler(`${API}/${id}`, 'PATCH', { nom_de_la_province: nom }));
    if (ok) dire('Enregistré');
    return ok;
  };

  const retirer = async (p: ProvinceAGerer) => {
    if (!window.confirm(questionDuRetrait(p))) return;
    if (await appeler(`${API}/${p.id}`, 'DELETE')) {
      setOuverte(null);
      dire('Province retirée');
    }
  };

  return (
    <>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      <form className="provinces-ajout" onSubmit={(e) => void ajouter(e)}>
        <input
          name="nom_de_la_province"
          placeholder="Nom de la province"
          aria-label="Nom de la province"
          required
          maxLength={120}
        />
        <ZoneDeDepot
          comme="label"
          className="provinces-ajout-ecusson"
          refuser={setErreur}
          tailleMaximale={TAILLE_MAXIMALE_ECUSSON_PROVINCIAL}
        >
          Écusson <span className="maigre">(facultatif)</span>
          <input name="ecusson" type="file" accept={ACCEPTE_ECUSSON} />
        </ZoneDeDepot>
        <button className="bouton bouton--fort" type="submit" disabled={occupe}>
          Ajouter
        </button>
      </form>

      {/* Une page vide laisserait croire à une panne. */}
      {provinces.length === 0 ? (
        <p className="vide-liste">
          Aucune province pour l&apos;instant. Elles arriveront avec la reprise des données de Bubble.
        </p>
      ) : (
        <div className="provinces provinces--gestion">
          {provinces.map((p) => (
            <CarteAGerer
              // Renommée ailleurs, la carte repart du nom à jour.
              key={`${p.id}:${p.nom_de_la_province ?? ''}`}
              province={p}
              ouverte={ouverte === p.id}
              basculer={() => setOuverte(ouverte === p.id ? null : p.id)}
              renommer={(nom) => renommer(p.id, nom)}
              deposer={(fichier) => void deposerLEcusson(p.id, fichier).then((ok) => ok && dire('Écusson déposé'))}
              retirer={() => void retirer(p)}
              signaler={setErreur}
              occupe={occupe}
            />
          ))}
        </div>
      )}

      <div className={`secteurs-enregistre${mot ? ' secteurs-enregistre--visible' : ''}`} role="status" aria-live="polite">
        {mot ?? ''}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function CarteAGerer({
  province,
  ouverte,
  basculer,
  renommer,
  deposer,
  retirer,
  signaler,
  occupe,
}: {
  province: ProvinceAGerer;
  ouverte: boolean;
  basculer: () => void;
  renommer: (nom: string) => Promise<boolean>;
  deposer: (fichier: File) => void;
  retirer: () => void;
  /** Dire pourquoi un fichier glissé est refusé. */
  signaler: (message: string) => void;
  occupe: boolean;
}) {
  const connu = province.nom_de_la_province ?? '';
  const [nom, setNom] = useState(connu);
  const affiche = nomAffiche(province.nom_de_la_province);
  const ecusson = province.a_un_ecusson ? adresseDeLEcusson(province.id, province.maj_le) : null;

  /** Enregistrer en quittant le champ, si le nom a changé ; un refus rend l'ancien. */
  const enregistrer = () => {
    if (nom.trim() === connu.trim()) return;
    void renommer(nom.trim()).then((ok) => {
      if (!ok) setNom(connu);
    });
  };

  return (
    <article className="carte-province">
      {/* L'image de la carte reçoit aussi un écusson glissé : il remplace
          l'actuel aussitôt, sans ouvrir le volet. */}
      <ZoneDeDepot
        className="carte-province-image"
        envoyer={deposer}
        refuser={signaler}
        tailleMaximale={TAILLE_MAXIMALE_ECUSSON_PROVINCIAL}
        desactivee={occupe}
        invite="Déposez l’écusson"
      >
        {/* `alt` vide : le nom est juste en dessous. Faute d'écusson,
            l'initiale — comme pour un référent sans photo. */}
        {ecusson ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ecusson} alt="" loading="lazy" />
        ) : (
          <span className="carte-province-initiale" aria-hidden="true">
            {initialeDeProvince(province.nom_de_la_province)}
          </span>
        )}
      </ZoneDeDepot>

      <div className="carte-province-tete">
        <p className="carte-province-nom">{affiche}</p>
        <button
          type="button"
          className="secteur-geste"
          onClick={basculer}
          aria-expanded={ouverte}
          title={ouverte ? 'Refermer' : 'Renommer, déposer l’écusson, retirer'}
          aria-label={ouverte ? `Refermer ${affiche}` : `Ouvrir ${affiche}`}
        >
          {ouverte ? '▴' : '▾'}
        </button>
      </div>

      {ouverte && (
        <div className="carte-province-volet">
          <label className="carte-province-champ">
            Nom
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              onBlur={enregistrer}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              required
              maxLength={120}
            />
          </label>

          <ZoneDeDepot
            className="carte-province-ecusson"
            envoyer={deposer}
            refuser={signaler}
            tailleMaximale={TAILLE_MAXIMALE_ECUSSON_PROVINCIAL}
            desactivee={occupe}
          >
            <Ecusson src={ecusson} nom={affiche} initiale={initialeDeProvince(province.nom_de_la_province)} />
            <label>
              {province.a_un_ecusson ? 'Remplacer l’écusson' : 'Déposer un écusson'}
              <input
                type="file"
                accept={ACCEPTE_ECUSSON}
                disabled={occupe}
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  if (fichier) deposer(fichier);
                  e.target.value = '';
                }}
              />
            </label>
            <small className="maigre">JPEG, PNG, WebP, GIF ou AVIF, 5 Mo au plus.</small>
          </ZoneDeDepot>

          <button type="button" className="reseau-retirer" onClick={retirer} disabled={occupe}>
            Retirer cette province
          </button>
        </div>
      )}
    </article>
  );
}
