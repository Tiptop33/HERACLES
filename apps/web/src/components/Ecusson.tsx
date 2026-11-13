import { initialeDeLoge } from '@/lib/loges-du-reseau';

/**
 * L'écusson d'une loge du réseau, ou — tant qu'il n'est pas déposé —
 * l'initiale de la loge dans un rond, comme une province sans image
 * (décisions du 13 novembre 2026). Sert aussi au volet d'une province, qui
 * passe alors sa propre initiale (`initialeDeProvince`).
 *
 * `alt` vide : le nom de la loge est toujours écrit à côté, et l'annoncer deux
 * fois n'aide personne.
 */
export default function Ecusson({
  src,
  nom,
  taille = 'petit',
  initiale,
}: {
  /** L'adresse de l'image, ou `null` s'il n'y en a pas. */
  src: string | null;
  nom: string;
  taille?: 'petit' | 'grand';
  /** L'initiale à montrer sans image ; par défaut, celle d'une loge. */
  initiale?: string;
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
      {initiale ?? initialeDeLoge(nom)}
    </span>
  );
}
