import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Le logo de l'association — Héraclès terrassant l'Hydre, dans un méandre grec.
 *
 * Le fichier se dépose dans `apps/web/public/` sous l'un des noms ci-dessous.
 * Tant qu'aucun n'est là, on affiche un « H » plutôt qu'une image cassée : la
 * page reste présentable avant même que le logo arrive.
 *
 * La recherche a lieu une seule fois, au chargement du module, et non à chaque
 * affichage de page.
 */
const NOMS = ['logo-heracles.png', 'logo-heracles.svg', 'logo-heracles.webp', 'logo-heracles.jpg'];

const trouve = NOMS.find((nom) => existsSync(path.join(process.cwd(), 'public', nom)));

export default function Logo({ taille = 'grand' }: { taille?: 'grand' | 'petit' }) {
  const classe = taille === 'petit' ? 'logo logo--petit' : 'logo';

  if (!trouve) {
    // En petit format, la marque est écrite juste à côté : un « H » de
    // remplacement ferait doublon. Mieux vaut ne rien mettre.
    if (taille === 'petit') return null;

    return (
      <span className={`${classe} logo--absent`} aria-hidden="true">
        H
      </span>
    );
  }

  // `alt` vide et `aria-hidden` : le nom « HERACLES » est déjà écrit juste à
  // côté, en toutes lettres. Le répéter ferait dire deux fois la même chose à
  // un lecteur d'écran.
  return (
    <span className={classe}>
      {/* `<img>` et non `next/image` : le fichier est déposé à la main, on ne
          connaît d'avance ni ses dimensions ni son format, et l'optimiseur de
          Next ne traite pas le SVG sans réglage supplémentaire. L'image fait
          quelques kilo-octets et s'affiche en 4,6 rem — il n'y a rien à
          optimiser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/${trouve}`} alt="" aria-hidden="true" />
    </span>
  );
}
