'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { initiales, nomAffichable } from '@/lib/format';
import type { Connecte } from '@/lib/presence';

/**
 * « Qui est là » — les référents de la loge qui sont devant leur écran en ce
 * moment, sous votre nom dans la colonne de gauche.
 *
 * Une photo par personne, et son prénom et son nom dans une bulle au survol.
 * L'infobulle du navigateur (`title`) ne suffisait pas : elle arrive tard, et
 * jamais au doigt — sur iPad, on ne savait pas qui était en ligne. La bulle
 * s'ouvre au survol, au clavier (chaque vignette prend le focus) et au toucher,
 * qui donne le focus. Le nom reste aussi en `aria-label` pour les lecteurs
 * d'écran.
 *
 * La bulle est en position fixe : la colonne défile, et une bulle placée dans
 * son flux y serait coupée sur les bords. Son centre est borné à la largeur de
 * la colonne, pour qu'une vignette en bout de rangée n'envoie pas son nom
 * dehors.
 *
 * **Le seul endroit de l'application où un script est nécessaire.** La liste
 * vieillirait sans lui : une page rendue par le serveur ne bouge plus une fois
 * affichée, et l'on peut rester une heure sur la même. Le rafraîchissement ne
 * touche que cette liste — le reste de l'écran ne bronche pas, et une saisie
 * en cours ne se perd pas.
 *
 * **Ce passage est aussi ce qui prouve qu'on est là** (migration 0058). Il ne
 * part que d'un onglet visible, et le serveur en note l'heure : deux minutes
 * sans nouvelles, et l'on sort de la colonne des autres. C'est ce qui fait
 * qu'un onglet fermé ne laisse pas un visage affiché jusqu'au soir.
 *
 * Sans JavaScript, la liste rendue par le serveur reste affichée telle quelle.
 * Elle ne se met plus à jour, mais elle est là : c'est un ornement qui se
 * dégrade, pas une fonction qui disparaît. En revanche on ne donne alors aucun
 * signe de vie, et l'on s'efface de la colonne des autres au bout de deux
 * minutes — une présence qui se mesure ne peut pas se deviner.
 */

/**
 * Trente secondes : assez pour suivre, assez peu pour ne pas peser. Le serveur
 * accorde deux minutes de silence (0058), soit quatre fois cette cadence : de
 * quoi perdre trois passages sans clignoter dans la colonne des autres.
 */
const CADENCE = 30_000;

/** La moitié de la largeur maximale de la bulle (10 rem), plus une marge. */
const DEMI_BULLE = 88;

/** `pointe` : l'écart entre le centre de la bulle et celui de la vignette. */
type Bulle = { nom: string; haut: number; centre: number; pointe: number };

export default function Connectes({ initiaux }: { initiaux: Connecte[] }) {
  const [connectes, setConnectes] = useState(initiaux);
  const [bulle, setBulle] = useState<Bulle | null>(null);
  const cadre = useRef<HTMLDivElement>(null);

  const montrer = (nom: string, vignette: HTMLElement) => {
    const r = vignette.getBoundingClientRect();
    const colonne = cadre.current?.getBoundingClientRect();
    const gauche = colonne ? colonne.left + DEMI_BULLE : r.left;
    const droite = colonne ? colonne.right - DEMI_BULLE : r.right;
    const vise = r.left + r.width / 2;
    const centre = droite > gauche ? Math.min(Math.max(vise, gauche), droite) : vise;
    setBulle({ nom, haut: r.bottom + 8, centre, pointe: vise - centre });
  };
  const cacher = () => setBulle(null);

  // La colonne qui défile emporte la vignette : la bulle fixe resterait en
  // l'air, à côté de personne.
  useEffect(() => {
    if (!bulle) return;
    window.addEventListener('scroll', cacher, true);
    return () => window.removeEventListener('scroll', cacher, true);
  }, [bulle]);

  useEffect(() => {
    let vivant = true;

    const relire = async () => {
      // Un onglet en arrière-plan n'a personne devant lui : inutile de
      // réveiller le serveur toutes les trente secondes pour rien.
      if (document.visibilityState !== 'visible') return;

      try {
        const reponse = await fetch('/api/connectes', { cache: 'no-store' });
        if (!reponse.ok) return;
        const lu = (await reponse.json()) as { connectes?: Connecte[] };
        if (vivant && Array.isArray(lu.connectes)) setConnectes(lu.connectes);
      } catch {
        // Le réseau a hoqueté : on garde la liste précédente et on réessaiera
        // dans trente secondes. Une colonne qui se vide au premier hoquet
        // ferait croire que tout le monde est parti.
      }
    };

    // Tout de suite, sans attendre la première demi-minute : une page qui
    // s'ouvre est un signe de vie, et il faut le poser avant que les deux
    // minutes du serveur ne s'écoulent. Sans lui, qui recharge sa page plus
    // souvent que toutes les trente secondes n'en donnerait jamais aucun.
    relire();

    const minuteur = setInterval(relire, CADENCE);
    document.addEventListener('visibilitychange', relire);

    return () => {
      vivant = false;
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', relire);
    };
  }, []);

  if (connectes.length === 0) return null;

  return (
    <div className="colonne-connectes" data-aide="connectes" ref={cadre}>
      <p className="colonne-connectes-titre">
        {connectes.length === 1 ? 'Aussi en ligne' : `Aussi en ligne — ${connectes.length}`}
      </p>

      <ul className="connectes-visages">
        {connectes.map((c) => {
          const nom = nomAffichable(c.prenom, c.nom, null) ?? 'Référent sans nom';
          return (
            <li
              key={c.referent_id}
              tabIndex={0}
              aria-label={nom}
              onMouseEnter={(e) => montrer(nom, e.currentTarget)}
              onMouseLeave={cacher}
              onFocus={(e) => montrer(nom, e.currentTarget)}
              onBlur={cacher}
            >
              {c.a_une_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/espace/referents/${c.referent_id}/photo`}
                  alt=""
                  width={30}
                  height={30}
                />
              ) : (
                <span className="connecte-initiales" aria-hidden="true">
                  {initiales(c.prenom, c.nom)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {bulle && (
        <span
          className="connecte-bulle"
          role="tooltip"
          style={
            {
              top: bulle.haut,
              left: bulle.centre,
              '--pointe': `${bulle.pointe}px`,
            } as CSSProperties
          }
        >
          {bulle.nom}
        </span>
      )}
    </div>
  );
}
