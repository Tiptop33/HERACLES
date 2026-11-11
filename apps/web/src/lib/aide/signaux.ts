/**
 * Ce que l'aide et la colonne de navigation se disent.
 *
 * Ce sont deux composants montés côte à côte par la coquille des espaces, sans
 * parent commun qui porterait leur état. Sur un téléphone ils ont pourtant
 * besoin l'un de l'autre :
 *
 *   · l'entrée « Aide » du menu ouvre la fenêtre de l'aide — le bouton
 *     flottant n'y est plus, il recouvrait la fiche ;
 *   · l'aide, quand elle désigne une entrée du menu, demande qu'il se déploie —
 *     replié, l'entrée n'est pas à l'écran et le personnage ne montrerait rien.
 *
 * Deux événements du navigateur, donc, plutôt qu'un contexte React à faire
 * descendre dans toute la coquille pour deux signaux.
 */

/** La colonne demande à l'aide d'ouvrir sa fenêtre. */
export const SIGNAL_OUVRIR_L_AIDE = 'heracles:aide';

/** L'aide demande à la colonne de se déployer (`detail: true`) ou de se replier. */
export const SIGNAL_MENU = 'heracles:menu';

/** Vrai si cette ancre désigne une entrée de la colonne de navigation. */
export function ancreDuMenu(ancre: string | null): boolean {
  return ancre !== null && (ancre.startsWith('menu:') || ancre.startsWith('eteint:'));
}
