'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Le personnage de l'aide : Héraclès, le héros de l'emblème, en petite figure
 * en volume dessinée en formes simples. Il se tourne vers l'élément désigné et
 * tend le bras vers lui.
 *
 * Il est construit ici, en code — aucun fichier de modèle, aucune licence à
 * suivre. Ses couleurs sont les siennes (l'ocre du lion, le lin de la
 * tunique) et non celles de l'application : elles se lisent sur fond clair
 * comme sur fond sombre.
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

type Corps = {
  tout: THREE.Group;
  buste: THREE.Group;
  brasDroit: THREE.Group;
  brasGauche: THREE.Group;
  jambeDroite: THREE.Group;
  jambeGauche: THREE.Group;
};

/**
 * Assemble la figure : Héraclès, tel que l'emblème le montre — la peau du lion
 * de Némée sur la tête, la barbe, la tunique claire, la massue dans le dos.
 *
 * Le squelette ne change pas : deux jambes pendues aux hanches, un buste, deux
 * bras pendus aux épaules. Tout ce qui l'habille est accroché au buste et le
 * suit quand il se tourne ; rien n'est tenu en main, pour que les deux bras
 * restent libres de désigner.
 */
function construire(): Corps {
  const plat = (color: string) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const peau = plat('#f0c9a4');
  const tunique = plat('#f1ead8');
  const lion = plat('#c9973f');
  const criniere = plat('#9a6a25');
  const barbe = plat('#4a3524');
  const cuir = plat('#7a5230');
  const noir = new THREE.MeshStandardMaterial({ color: '#16202e' });

  const tout = new THREE.Group();

  // Une jambe pend de sa hanche, comme un bras de son épaule : la faire
  // tourner autour de la hanche, c'est faire un pas. Les jambes ne tournent
  // pas avec le buste : à l'arrêt, les pieds restent plantés. Jambes nues,
  // sandales de cuir.
  const jambe = (cote: number) => {
    const hanche = new THREE.Group();
    hanche.position.set(cote * 0.15, 0.55, 0);

    const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.55, 8), peau);
    cuisse.position.y = -0.275;
    hanche.add(cuisse);

    const pied = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), cuir);
    pied.position.set(0, -0.5, 0.06);
    hanche.add(pied);

    tout.add(hanche);
    return hanche;
  };
  const jambeDroite = jambe(1);
  const jambeGauche = jambe(-1);

  const buste = new THREE.Group();
  tout.add(buste);

  /** Pose une forme sur le buste. */
  const poser = (
    forme: THREE.BufferGeometry,
    matiere: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const piece = new THREE.Mesh(forme, matiere);
    piece.position.set(x, y, z);
    buste.add(piece);
    return piece;
  };

  // Le torse, un peu plus large que celui d'un passant, et sa ceinture.
  poser(new THREE.CapsuleGeometry(0.34, 0.4, 3, 10), tunique, 0, 0.98, 0);
  poser(new THREE.CylinderGeometry(0.325, 0.325, 0.07, 12), cuir, 0, 0.84, 0);

  poser(new THREE.IcosahedronGeometry(0.3, 1), peau, 0, 1.66, 0);

  for (const cote of [-1, 1]) {
    poser(new THREE.SphereGeometry(0.035, 8, 8), noir, cote * 0.11, 1.67, 0.275);
  }

  // La peau du lion : la gueule coiffe la tête, deux oreilles, la crinière sur
  // la nuque, et la dépouille qui tombe dans le dos.
  poser(
    new THREE.SphereGeometry(0.335, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.9),
    lion,
    0,
    1.68,
    -0.02,
  );
  for (const cote of [-1, 1]) {
    poser(new THREE.IcosahedronGeometry(0.085, 0), lion, cote * 0.2, 1.97, -0.02);
  }
  const TOUFFES_DE_CRINIERE = [
    [0.3, 0.02, -0.12],
    [-0.3, 0.02, -0.12],
    [0.2, -0.12, -0.26],
    [-0.2, -0.12, -0.26],
    [0, -0.16, -0.31],
  ];
  for (const [x, y, z] of TOUFFES_DE_CRINIERE) {
    poser(new THREE.IcosahedronGeometry(0.12, 0), criniere, x, 1.66 + y, z);
  }
  poser(new THREE.BoxGeometry(0.56, 0.75, 0.07), lion, 0, 1.0, -0.31);

  // Un collier de barbe : des touffes le long de la mâchoire, la bouche
  // dégagée. Une barbe d'un seul bloc se lisait comme un masque.
  const TOUFFES_DE_BARBE = [
    [-0.2, -0.13, 0.16, 0.1],
    [0.2, -0.13, 0.16, 0.1],
    [-0.11, -0.24, 0.2, 0.1],
    [0.11, -0.24, 0.2, 0.1],
    [0, -0.29, 0.21, 0.11],
    [-0.27, -0.02, 0.06, 0.09],
    [0.27, -0.02, 0.06, 0.09],
  ];
  for (const [x, y, z, rayon] of TOUFFES_DE_BARBE) {
    poser(new THREE.IcosahedronGeometry(rayon, 0), barbe, x, 1.66 + y, z);
  }

  // La massue, en travers du dos : on la voit quand il marche de profil.
  const massue = poser(new THREE.CylinderGeometry(0.1, 0.04, 0.85, 6), cuir, 0.12, 1.2, -0.4);
  massue.rotation.z = 0.55;

  // Un bras pend de son épaule : le faire tourner autour de l'épaule suffit à
  // le lever dans n'importe quelle direction. Bras nus.
  const bras = (cote: number) => {
    const epaule = new THREE.Group();
    epaule.position.set(cote * 0.41, 1.22, 0);

    const avantBras = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.5, 8), peau);
    avantBras.position.y = -0.25;
    epaule.add(avantBras);

    const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 0), peau);
    main.position.y = -0.55;
    epaule.add(main);

    buste.add(epaule);
    return epaule;
  };

  return { tout, buste, brasDroit: bras(1), brasGauche: bras(-1), jambeDroite, jambeGauche };
}

/** Rapproche une valeur de sa cible, un peu à chaque image. */
function vers(actuel: number, cible: number, pas: number): number {
  return actuel + (cible - actuel) * pas;
}

export default function Personnage({
  direction,
  marche,
}: {
  direction: Direction | null;
  /**
   * Le sens de sa marche tant qu'il se déplace, `null` à l'arrêt. Une
   * référence, écrite par `Aide.tsx` au départ et à l'arrivée : la marche
   * commence et finit sans rendu React.
   */
  marche?: React.RefObject<Direction | null>;
}) {
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
      const sens = marche?.current ?? null;
      const pas = immobile ? 1 : 0.12;

      // Au repos, les bras pendent, à peine écartés.
      let droit = 0.12;
      let gauche = -0.12;
      let tourne = 0;

      // En marche : les jambes et les bras se balancent, et tout le corps
      // se tourne vers là où il va.
      let foulee = 0;
      let profil = 0;

      if (sens) {
        foulee = Math.sin(t * 11) * 0.65;
        // Presque de profil quand il va de côté ; de face quand il monte ou
        // descend — on ne lui voit jamais le dos.
        profil = Math.max(-1, Math.min(1, sens.x * 1.6)) * 1.15;
        droit = 0.12;
        gauche = -0.12;
      } else if (d) {
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

      // La foulée : une jambe en avant, l'autre en arrière, les bras à
      // l'opposé des jambes. À l'arrêt, tout revient en douceur à zéro.
      const allure = sens ? 0.5 : pas;
      corps.jambeDroite.rotation.x = vers(corps.jambeDroite.rotation.x, foulee, allure);
      corps.jambeGauche.rotation.x = vers(corps.jambeGauche.rotation.x, -foulee, allure);
      corps.brasDroit.rotation.x = vers(corps.brasDroit.rotation.x, -foulee * 0.8, allure);
      corps.brasGauche.rotation.x = vers(corps.brasGauche.rotation.x, foulee * 0.8, allure);
      corps.tout.rotation.y = vers(corps.tout.rotation.y, profil, pas * 1.5);

      // Il respire à l'arrêt ; en marche, il rebondit à chaque pas.
      corps.tout.position.y = immobile
        ? 0
        : sens
          ? Math.abs(Math.sin(t * 11)) * 0.05
          : Math.sin(t * 2.2) * 0.025;

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
  }, [marche]);

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
