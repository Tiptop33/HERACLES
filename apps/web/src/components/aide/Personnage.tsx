'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Le personnage de l'aide : une petite figure en volume, dessinée en formes
 * simples, qui se tourne vers l'élément désigné et tend le bras vers lui.
 *
 * Il est construit ici, en code — aucun fichier de modèle, aucune licence à
 * suivre, et sa tenue prend les couleurs de l'application (`--marque`,
 * `--encre`), thème sombre compris.
 *
 * Ce fichier est le seul à tirer `three` : `Aide.tsx` ne le charge qu'à la
 * première visite guidée, pas à l'ouverture de chaque écran.
 *
 * Sans WebGL (vieux navigateur, carte graphique refusée), une flèche plate
 * prend sa place : l'aide continue de désigner, sans le relief.
 */

/** La direction de l'élément désigné, vue du personnage. `y` descend, comme à l'écran. */
export type Direction = { x: number; y: number };

export const LARGEUR_DU_PERSONNAGE = 120;
export const HAUTEUR_DU_PERSONNAGE = 140;

/** Une couleur lue dans la feuille de style, avec un repli si elle manque. */
function couleur(variable: string, repli: string): THREE.Color {
  const lue = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  try {
    return new THREE.Color(lue || repli);
  } catch {
    return new THREE.Color(repli);
  }
}

type Corps = {
  tout: THREE.Group;
  buste: THREE.Group;
  brasDroit: THREE.Group;
  brasGauche: THREE.Group;
};

/** Assemble la figure : jambes, buste, tête, deux bras articulés à l'épaule. */
function construire(): Corps {
  const tenue = new THREE.MeshStandardMaterial({ color: couleur('--marque', '#3f9fc2'), flatShading: true });
  const sombre = new THREE.MeshStandardMaterial({ color: couleur('--encre', '#16202e'), flatShading: true });
  const peau = new THREE.MeshStandardMaterial({ color: '#f0c9a4', flatShading: true });
  const noir = new THREE.MeshStandardMaterial({ color: '#16202e' });

  const tout = new THREE.Group();

  // Les jambes ne tournent pas avec le buste : les pieds restent plantés.
  for (const cote of [-1, 1]) {
    const jambe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.55, 8), sombre);
    jambe.position.set(cote * 0.15, 0.275, 0);
    tout.add(jambe);

    const pied = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), sombre);
    pied.position.set(cote * 0.15, 0.05, 0.06);
    tout.add(pied);
  }

  const buste = new THREE.Group();
  tout.add(buste);

  const torse = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.4, 3, 10), tenue);
  torse.position.y = 0.98;
  buste.add(torse);

  const tete = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), peau);
  tete.position.y = 1.66;
  buste.add(tete);

  // Les cheveux : une calotte posée sur le haut du crâne.
  const cheveux = new THREE.Mesh(
    new THREE.SphereGeometry(0.315, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.3),
    sombre,
  );
  cheveux.position.y = 1.68;
  buste.add(cheveux);

  for (const cote of [-1, 1]) {
    const oeil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), noir);
    oeil.position.set(cote * 0.11, 1.67, 0.275);
    buste.add(oeil);
  }

  // Un bras pend de son épaule : le faire tourner autour de l'épaule suffit à
  // le lever dans n'importe quelle direction.
  const bras = (cote: number) => {
    const epaule = new THREE.Group();
    epaule.position.set(cote * 0.37, 1.22, 0);

    const manche = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 8), tenue);
    manche.position.y = -0.25;
    epaule.add(manche);

    const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 0), peau);
    main.position.y = -0.55;
    epaule.add(main);

    buste.add(epaule);
    return epaule;
  };

  return { tout, buste, brasDroit: bras(1), brasGauche: bras(-1) };
}

/** Rapproche une valeur de sa cible, un peu à chaque image. */
function vers(actuel: number, cible: number, pas: number): number {
  return actuel + (cible - actuel) * pas;
}

export default function Personnage({ direction }: { direction: Direction | null }) {
  const toile = useRef<HTMLCanvasElement>(null);
  // La direction change à chaque défilement : une référence, pour ne pas
  // reconstruire la scène à chaque fois.
  const cible = useRef<Direction | null>(direction);
  const [sansRelief, setSansRelief] = useState(false);

  useEffect(() => {
    cible.current = direction;
  }, [direction]);

  useEffect(() => {
    const canevas = toile.current;
    if (!canevas) return;

    let rendu: THREE.WebGLRenderer;
    try {
      rendu = new THREE.WebGLRenderer({ canvas: canevas, alpha: true, antialias: true });
    } catch {
      // Hors du corps de l'effet : l'état ne change qu'à l'image suivante.
      const repli = requestAnimationFrame(() => setSansRelief(true));
      return () => cancelAnimationFrame(repli);
    }

    rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendu.setSize(LARGEUR_DU_PERSONNAGE, HAUTEUR_DU_PERSONNAGE, false);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight('#ffffff', 1.5));
    const soleil = new THREE.DirectionalLight('#ffffff', 2.2);
    soleil.position.set(2, 4, 5);
    scene.add(soleil);

    const camera = new THREE.PerspectiveCamera(
      30,
      LARGEUR_DU_PERSONNAGE / HAUTEUR_DU_PERSONNAGE,
      0.1,
      50,
    );
    camera.position.set(0, 1.12, 4.7);
    camera.lookAt(0, 1.0, 0);

    const corps = construire();
    scene.add(corps.tout);

    const immobile = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const debut = performance.now();
    let image = 0;

    const dessiner = (maintenant: number) => {
      const t = (maintenant - debut) / 1000;
      const d = cible.current;
      const pas = immobile ? 1 : 0.12;

      // Au repos, les bras pendent, à peine écartés.
      let droit = 0.12;
      let gauche = -0.12;
      let tourne = 0;

      if (d) {
        // Le bras pend vers le bas : l'angle qui l'amène sur la direction
        // voulue est `atan2(x, y)`, `y` descendant comme à l'écran.
        let angle = Math.atan2(d.x, d.y);
        // Une cible juste dessous laisserait le bras pendre, comme au repos :
        // on l'écarte assez pour que le geste se voie.
        if (Math.abs(angle) < 0.5) angle = d.x >= 0 ? 0.5 : -0.5;
        const battement = immobile ? 0 : Math.sin(t * 5) * 0.06;
        // Le bras du côté de la cible : l'autre croiserait le corps.
        if (d.x >= 0) droit = angle + battement;
        else gauche = angle + battement;
        tourne = Math.max(-1, Math.min(1, d.x)) * 0.45;
      } else if (!immobile) {
        // Personne à désigner : il salue de la main.
        droit = 2.5 + Math.sin(t * 6) * 0.25;
      }

      corps.brasDroit.rotation.z = vers(corps.brasDroit.rotation.z, droit, pas);
      corps.brasGauche.rotation.z = vers(corps.brasGauche.rotation.z, gauche, pas);
      corps.buste.rotation.y = vers(corps.buste.rotation.y, tourne, pas);
      corps.tout.position.y = immobile ? 0 : Math.sin(t * 2.2) * 0.025;

      rendu.render(scene, camera);
      image = requestAnimationFrame(dessiner);
    };
    image = requestAnimationFrame(dessiner);

    return () => {
      cancelAnimationFrame(image);
      scene.traverse((objet) => {
        if (objet instanceof THREE.Mesh) {
          objet.geometry.dispose();
          const matiere = objet.material as THREE.Material | THREE.Material[];
          for (const m of Array.isArray(matiere) ? matiere : [matiere]) m.dispose();
        }
      });
      rendu.dispose();
    };
  }, []);

  if (sansRelief) {
    const angle = direction ? (Math.atan2(direction.y, direction.x) * 180) / Math.PI : -90;
    return (
      <span className="aide-fleche" aria-hidden="true" style={{ transform: `rotate(${angle}deg)` }}>
        ➜
      </span>
    );
  }

  return (
    <canvas
      ref={toile}
      className="aide-personnage"
      width={LARGEUR_DU_PERSONNAGE}
      height={HAUTEUR_DU_PERSONNAGE}
      aria-hidden="true"
    />
  );
}
