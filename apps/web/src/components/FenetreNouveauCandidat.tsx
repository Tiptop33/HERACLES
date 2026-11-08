'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import LienACopier from '@/app/espace/candidats/nouveau/LienACopier';
import { FenetreNouveauCandidat as Schema, premiereErreur } from '@/lib/parrainage';
import { EVENEMENT_NOUVEAU_CANDIDAT } from './OuvrirNouveauCandidat';

/**
 * La fenêtre « Nouveau candidat » : l'adresse du candidat, celle du parrain,
 * Annuler, Valider.
 *
 * Flottante et non modale : l'écran dessous reste lisible et cliquable, et la
 * fenêtre se déplace par sa barre de titre — à la souris comme au doigt sur
 * l'iPad. Elle est montée une fois, dans la coquille des espaces ; les boutons
 * qui l'ouvrent ne font qu'émettre un événement (`OuvrirNouveauCandidat`).
 *
 * Valider appelle la même route que la page `/espace/candidats/nouveau`, qui
 * vérifie la session puis le droit côté base. Si le courriel ne part pas, le
 * lien s'affiche ici pour être transmis à la main.
 */

type Position = { x: number; y: number };

/** Largeur de la fenêtre : celle du CSS, pour la centrer à l'ouverture. */
const LARGEUR = 420;
/** L'écart minimal avec les bords de l'écran. */
const MARGE = 16;

/**
 * La position, ramenée dans l'écran : la fenêtre y reste entière, boutons
 * compris. Une fenêtre poussée à moitié hors champ cache justement Valider.
 */
function bornee(p: Position, largeur: number, hauteur: number): Position {
  const maxX = Math.max(MARGE, window.innerWidth - largeur - MARGE);
  const maxY = Math.max(MARGE, window.innerHeight - hauteur - MARGE);
  return {
    x: Math.min(Math.max(MARGE, p.x), maxX),
    y: Math.min(Math.max(MARGE, p.y), maxY),
  };
}

export default function FenetreNouveauCandidat() {
  const router = useRouter();
  const [ouverte, setOuverte] = useState(false);
  const [position, setPosition] = useState<Position>({ x: MARGE, y: 80 });
  const [erreur, setErreur] = useState<{ champ: string | null; message: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);

  const fenetre = useRef<HTMLDivElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  const premierChamp = useRef<HTMLInputElement>(null);
  /** Le bouton qui l'a ouverte : le focus y revient à la fermeture. */
  const origine = useRef<HTMLElement | null>(null);
  /** L'écart entre le doigt et le coin de la fenêtre, pendant un glisser. */
  const prise = useRef<Position | null>(null);
  /** L'état d'ouverture, lisible depuis l'écouteur posé une fois pour toutes. */
  const estOuverte = useRef(false);

  const dimensions = () => {
    const r = fenetre.current?.getBoundingClientRect();
    return { largeur: r?.width ?? LARGEUR, hauteur: r?.height ?? 300 };
  };

  // L'ouverture, depuis n'importe quel bouton « Nouveau candidat ».
  useEffect(() => {
    const ouvrir = () => {
      origine.current = document.activeElement as HTMLElement | null;
      // Déjà ouverte : on ne la ramène pas au centre, on y remet le focus.
      if (!estOuverte.current) {
        const largeur = Math.min(LARGEUR, window.innerWidth - 2 * MARGE);
        setPosition(
          bornee({ x: (window.innerWidth - largeur) / 2, y: window.innerHeight * 0.12 }, largeur, 300),
        );
      }
      estOuverte.current = true;
      setOuverte(true);
      // Après le rendu : le champ existe alors.
      requestAnimationFrame(() => premierChamp.current?.focus());
    };
    window.addEventListener(EVENEMENT_NOUVEAU_CANDIDAT, ouvrir);
    return () => window.removeEventListener(EVENEMENT_NOUVEAU_CANDIDAT, ouvrir);
  }, []);

  const fermer = useCallback(() => {
    if (envoi) return;
    estOuverte.current = false;
    setOuverte(false);
    setErreur(null);
    setEnvoye(null);
    setLien(null);
    formulaire.current?.reset();
    origine.current?.focus?.();
  }, [envoi]);

  // Échap vaut Annuler — seulement quand le focus est dans la fenêtre : elle
  // n'est pas modale, et Échap ailleurs appartient à l'écran dessous.
  useEffect(() => {
    if (!ouverte) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fenetre.current?.contains(document.activeElement)) fermer();
    };
    // Une fenêtre redimensionnée ne doit pas laisser la nôtre hors champ.
    const recadrer = () => {
      const { largeur, hauteur } = dimensions();
      setPosition((p) => bornee(p, largeur, hauteur));
    };
    window.addEventListener('keydown', touche);
    window.addEventListener('resize', recadrer);
    // Un message qui apparaît fait grandir la fenêtre : si on l'avait poussée
    // vers le bas, Valider passerait sous le bord de l'écran.
    const observateur =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(recadrer);
    if (fenetre.current) observateur?.observe(fenetre.current);
    return () => {
      window.removeEventListener('keydown', touche);
      window.removeEventListener('resize', recadrer);
      observateur?.disconnect();
    };
  }, [ouverte, fermer]);

  // Le glisser, par la barre de titre. Pointer Events : souris, stylet, doigt.
  function saisir(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    prise.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function glisser(e: React.PointerEvent<HTMLDivElement>) {
    if (!prise.current) return;
    const { largeur, hauteur } = dimensions();
    setPosition(
      bornee({ x: e.clientX - prise.current.x, y: e.clientY - prise.current.y }, largeur, hauteur),
    );
  }

  function lacher(e: React.PointerEvent<HTMLDivElement>) {
    prise.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  async function valider(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoye(null);
    setLien(null);

    const donnees = Object.fromEntries(new FormData(evenement.currentTarget));
    const lu = Schema.safeParse(donnees);
    if (!lu.success) {
      setErreur(premiereErreur(lu.error));
      return;
    }

    setEnvoi(true);
    try {
      const reponse = await fetch('/api/parrainages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lu.data),
      });
      const resultat = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur({ champ: null, message: resultat.erreur ?? 'L’invitation n’a pas pu être créée.' });
        return;
      }

      if (resultat.envoye) setEnvoye(lu.data.email);
      else setLien(resultat.lien ?? null);

      formulaire.current?.reset();
      premierChamp.current?.focus();
      // Le tableau des invitations, s'il est à l'écran, se met à jour.
      router.refresh();
    } catch {
      setErreur({ champ: null, message: 'La connexion au serveur a échoué. Réessayez.' });
    } finally {
      setEnvoi(false);
    }
  }

  if (!ouverte) return null;

  const invalide = (champ: string) => (erreur?.champ === champ ? true : undefined);

  return (
    <div
      ref={fenetre}
      className="flottante"
      role="dialog"
      aria-labelledby="fenetre-nouveau-candidat-titre"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="flottante-barre"
        onPointerDown={saisir}
        onPointerMove={glisser}
        onPointerUp={lacher}
        onPointerCancel={lacher}
      >
        <h2 id="fenetre-nouveau-candidat-titre">Nouveau candidat</h2>
      </div>

      <form ref={formulaire} className="flottante-corps" onSubmit={valider} noValidate>
        {erreur && (
          <p className="erreur" role="alert">
            {erreur.message}
          </p>
        )}

        {envoye && (
          <p className="encart" role="status">
            Le lien est parti chez <strong>{envoye}</strong>.
          </p>
        )}

        {lien && (
          <LienACopier
            lien={lien}
            consigne="Le courriel n’est pas parti. L’invitation est enregistrée : transmettez ce lien au parrain."
          />
        )}

        <div className="champ">
          <label htmlFor="fenetre-candidat-email">Adresse e-mail du candidat</label>
          <input
            ref={premierChamp}
            id="fenetre-candidat-email"
            name="candidat_email"
            type="email"
            autoComplete="off"
            required
            aria-invalid={invalide('candidat_email')}
          />
        </div>

        <div className="champ">
          <label htmlFor="fenetre-parrain-email">Adresse e-mail du parrain</label>
          <input
            id="fenetre-parrain-email"
            name="email"
            type="email"
            autoComplete="off"
            required
            aria-invalid={invalide('email')}
          />
        </div>

        <div className="flottante-actions">
          <button type="button" className="bouton" onClick={fermer} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="bouton bouton--fort" disabled={envoi}>
            {envoi ? 'Envoi…' : 'Valider'}
          </button>
        </div>
      </form>
    </div>
  );
}
