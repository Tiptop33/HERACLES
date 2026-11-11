import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Où trouver le logo de l'association — Héraclès terrassant l'Hydre, dans un
 * méandre grec.
 *
 * Le fichier se dépose dans `apps/web/public/` sous l'un de ces noms. Il n'est
 * pas fourni avec le code : c'est l'emblème d'une association, pas un actif du
 * dépôt, et l'inventer serait pire que de ne rien mettre. Tant qu'aucun n'est
 * là, les écrans affichent un « H » plutôt qu'une image cassée.
 *
 * La recherche a lieu une seule fois, au chargement du module, et non à chaque
 * affichage de page. Le fichier ne peut pas apparaître en cours de route : il
 * entre dans l'image au moment de la construire.
 */
const NOMS = ['logo-heracles.png', 'logo-heracles.svg', 'logo-heracles.webp', 'logo-heracles.jpg'];

const nom = NOMS.find((n) => existsSync(path.join(process.cwd(), 'public', n)));

/** Le chemin public du logo, ou `null` s'il n'a pas encore été déposé. */
export const cheminLogo: string | null = nom ? `/${nom}` : null;

/**
 * Les icônes de l'écran d'accueil du téléphone : le même emblème, en carré sur
 * fond blanc, aux deux tailles que demande Android. Déposées dans `public/`
 * comme le logo ; absentes, rien n'est annoncé.
 */
export const ICONES: { src: string; cote: number }[] = [192, 512]
  .map((cote) => ({ src: `/icone-${cote}.png`, cote }))
  .filter(({ src }) => existsSync(path.join(process.cwd(), 'public', src)));

/** Celle que l'iPhone et l'iPad posent sur l'écran d'accueil : la plus petite. */
export const cheminIconeApple: string | null = ICONES[0]?.src ?? null;
