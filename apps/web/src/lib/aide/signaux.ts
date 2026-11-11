/**
 * Ce que l'aide et la colonne de navigation se disent.
 *
 * Ce sont deux composants montés côte à côte par la coquille des espaces, sans
 * parent commun qui porterait leur état. Sur un téléphone ils ont pourtant
 * besoin l'un de l'autre :
 *
 *   · l'entrée « Aide » du menu ouvre la fenêtre de l'aide — le bouton
 *     flottant n'y est plus, il recouvrait la fiche ;
 *   · l'aide, quand elle désigne une entrée du menu, le dit à la colonne, qui
 *     se déploie — repliée, l'entrée n'est pas à l'écran et le personnage ne
 *     montrerait rien.
 *
 * Deux événements du navigateur, donc, plutôt qu'un contexte React à faire
 * descendre dans toute la coquille pour deux signaux.
 */

/** La colonne demande à l'aide d'ouvrir sa fenêtre. */
export const SIGNAL_OUVRIR_L_AIDE = 'heracles:aide';

/**
 * L'aide dit à la colonne quelle entrée du menu elle désigne — `detail` porte
 * l'ancre —, ou qu'elle n'en désigne plus aucune (`detail: null`). À la colonne
 * de se déployer si l'entrée est dans le panneau, et de se replier sinon.
 */
export const SIGNAL_MENU = 'heracles:menu';

/**
 * Les entrées que le téléphone range dans sa barre d'onglets, et non dans le
 * panneau « Plus ». L'aide les désigne dans la barre : le panneau n'a pas à
 * s'ouvrir pour elles.
 */
export const ANCRES_DES_ONGLETS: readonly string[] = [
  'menu:/espace/referents',
  'menu:/espace/candidats',
];

/** Vrai si cette ancre désigne une entrée de la colonne de navigation. */
export function ancreDuMenu(ancre: string | null): boolean {
  return ancre !== null && (ancre.startsWith('menu:') || ancre.startsWith('eteint:'));
}
