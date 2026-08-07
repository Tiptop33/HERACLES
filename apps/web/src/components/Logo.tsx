import { cheminLogo } from '@/lib/logo';

/**
 * Le logo de l'association, quand il est là — voir `lib/logo.ts` pour les noms
 * de fichier acceptés et pourquoi il n'est pas dans le dépôt.
 */
export default function Logo({ taille = 'grand' }: { taille?: 'grand' | 'petit' }) {
  const classe = taille === 'petit' ? 'logo logo--petit' : 'logo';

  if (!cheminLogo) {
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
      <img src={cheminLogo} alt="" aria-hidden="true" />
    </span>
  );
}
