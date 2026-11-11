/**
 * La marche du personnage d'une étape à l'autre — la partie qui se calcule.
 *
 * Quand l'élément désigné change, le personnage ne saute pas à sa nouvelle
 * place : il y va à pied. `Aide.tsx` mesure d'où il part et où il arrive ;
 * ici, on décide s'il y a lieu de marcher, combien de temps, et vers où il
 * regarde en chemin.
 */

export type Point = { x: number; y: number };

export type Marche = {
  /** Le décalage de départ, à résorber : d'où il vient, vu d'où il va. */
  depuis: Point;
  /** La durée du trajet, en millisecondes. */
  duree: number;
  /** Le sens du trajet ; `y` descend, comme à l'écran. */
  sens: Point;
};

/** En deçà, ce n'est pas un trajet : l'élément a seulement bougé un peu. */
export const PAS_MINIMAL = 40;

/** Sa vitesse, en pixels par seconde : un pas vif, pas une course. */
const VITESSE = 520;
const DUREE_MINIMALE = 350;
/** Au-delà, on attendrait le personnage au lieu de lire sa bulle. */
const DUREE_MAXIMALE = 1300;

/** Le trajet du point de départ au point d'arrivée, ou `null` s'il est trop court. */
export function marcheEntre(depart: Point, arrivee: Point): Marche | null {
  const dx = arrivee.x - depart.x;
  const dy = arrivee.y - depart.y;
  const distance = Math.hypot(dx, dy);
  if (distance < PAS_MINIMAL) return null;

  const duree = Math.min(Math.max((distance / VITESSE) * 1000, DUREE_MINIMALE), DUREE_MAXIMALE);
  return {
    depuis: { x: -dx, y: -dy },
    duree: Math.round(duree),
    sens: { x: dx / distance, y: dy / distance },
  };
}
