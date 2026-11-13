import { initialeDeLoge } from '@/lib/loges-du-reseau';

/**
 * L'écusson d'une loge du réseau, ou — tant qu'il n'est pas déposé —
 * l'initiale de la loge dans un rond, comme une province sans image
 * (décisions du 13 novembre 2026).
 *
 * `alt` vide : le nom de la loge est toujours écrit à côté, et l'annoncer deux
 * fois n'aide personne.
 */
export default function Ecusson({
  src,
  nom,
  taille = 'petit',
}: {
  /** L'adresse de l'image, ou `null` s'il n'y en a pas. */
  src: string | null;
  nom: string;
  taille?: 'petit' | 'grand';
}) {
  if (src) {
    return (
      <span className={`ecusson ecusson--${taille}`}>
        {/* L'image est servie par une route qui contrôle l'accès : l'optimiseur
            d'images de Next.js n'y a pas sa place. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </span>
    );
  }
  return (
    <span className={`ecusson ecusson--${taille} ecusson--initiale`} aria-hidden="true">
      {initialeDeLoge(nom)}
    </span>
  );
}
