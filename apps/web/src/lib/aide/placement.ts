/**
 * Où poser le personnage par rapport à l'élément qu'il désigne.
 *
 * Il se met à droite de l'élément quand la place y est, sinon à gauche, sinon
 * dessous, sinon dessus — toujours à côté, jamais dessus : l'élément doit
 * rester visible et cliquable. Du calcul pur, sans écran : il se teste.
 */

/** Un rectangle à l'écran, en pixels. */
export type Boite = { x: number; y: number; l: number; h: number };

export type Cote = 'droite' | 'gauche' | 'dessous' | 'dessus';

export type Place = {
  cote: Cote;
  /** Le bord gauche du guide. */
  x: number;
  /** Son bord haut — ou, quand il est au-dessus, la distance de son bord bas au bas de l'écran. */
  y: number;
  /** Vrai quand `y` se compte depuis le bas de l'écran. */
  depuisLeBas: boolean;
  /** La direction de l'élément vue du personnage ; `y` descend. */
  direction: { x: number; y: number };
};

export type Mesures = {
  /** L'écran. */
  ecran: { l: number; h: number };
  /** Le guide entier : le personnage et sa bulle. */
  guide: { l: number; h: number };
  /** Le personnage seul. */
  personnage: { l: number; h: number };
};

const ECART = 14;
const BORD = 8;

function borner(valeur: number, min: number, max: number): number {
  return Math.min(Math.max(valeur, min), Math.max(min, max));
}

export function placer(cible: Boite, { ecran, guide, personnage }: Mesures): Place {
  const milieuX = cible.x + cible.l / 2;
  const milieuY = cible.y + cible.h / 2;

  const tientADroite = cible.x + cible.l + ECART + guide.l <= ecran.l - BORD;
  const tientAGauche = cible.x - ECART - guide.l >= BORD;
  const tientDessous = cible.y + cible.h + ECART + guide.h <= ecran.h - BORD;

  let cote: Cote;
  if (tientADroite) cote = 'droite';
  else if (tientAGauche) cote = 'gauche';
  else if (tientDessous) cote = 'dessous';
  else cote = 'dessus';

  let x: number;
  let y: number;
  let depuisLeBas = false;
  // Le centre du personnage, pour savoir vers où il tend le bras.
  let centreX: number;
  let centreY: number;

  if (cote === 'droite' || cote === 'gauche') {
    x = cote === 'droite' ? cible.x + cible.l + ECART : cible.x - ECART - guide.l;
    y = borner(milieuY - personnage.h / 2, BORD, ecran.h - guide.h - BORD);
    centreX = cote === 'droite' ? x + personnage.l / 2 : x + guide.l - personnage.l / 2;
    centreY = y + personnage.h / 2;
  } else {
    x = borner(milieuX - guide.l / 2, BORD, ecran.l - guide.l - BORD);
    centreX = x + guide.l / 2;
    if (cote === 'dessous') {
      y = cible.y + cible.h + ECART;
      centreY = y + personnage.h / 2;
    } else {
      // Au-dessus, le guide s'accroche par le bas : sa hauteur réelle dépend
      // du texte, et c'est son pied qui doit toucher l'élément.
      depuisLeBas = true;
      y = Math.max(BORD, ecran.h - cible.y + ECART);
      centreY = cible.y - ECART - personnage.h / 2;

      // Pas la place au-dessus non plus — un élément haut sur un petit écran,
      // la case d'accord d'un formulaire sur un téléphone : le guide se cale
      // en haut de l'écran, quitte à mordre sur l'élément. Mieux vaut le
      // recouvrir un peu que sortir de l'écran avec sa bulle.
      if (cible.y - ECART - guide.h < BORD) {
        depuisLeBas = false;
        y = BORD;
        centreY = BORD + guide.h - personnage.h / 2;
      }
    }
  }

  // Il vise le point de l'élément le plus proche de lui, pas son centre : sur
  // un élément large, le bras partirait sinon dans une direction sans rapport.
  const viseX = borner(centreX, cible.x, cible.x + cible.l);
  const viseY = borner(centreY, cible.y, cible.y + cible.h);
  const dx = viseX - centreX;
  const dy = viseY - centreY;
  const longueur = Math.hypot(dx, dy) || 1;

  return { cote, x, y, depuisLeBas, direction: { x: dx / longueur, y: dy / longueur } };
}
