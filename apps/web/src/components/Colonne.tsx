'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PARAMETRES, estCourante, famillesDuRole } from '@/lib/navigation';
import { nomAffichable } from '@/lib/format';
import type { Connecte } from '@/lib/presence';
import type { MaPhoto, Profil } from '@/lib/profil';
import Connectes from './Connectes';
import { Roue } from './Icones';

/**
 * La colonne de gauche de la maquette `1a` : la marque, qui l'on est, puis les
 * cinq familles.
 *
 * Composant client, parce qu'il lui faut l'adresse courante pour savoir quoi
 * mettre en surbrillance. Le logo lui est passé plutôt qu'importé : le
 * composant `Logo` lit le disque, ce qu'un composant client ne peut pas faire.
 *
 * Les entrées dont l'écran n'existe pas encore sont éteintes plutôt
 * qu'absentes — voir `lib/navigation.ts` pour la raison.
 */
export default function Colonne({
  profil,
  logo,
  connectes = [],
  photo = null,
}: {
  profil: Profil;
  logo: string | null;
  /** Les collègues de la loge dont la session est ouverte (migration 0042). */
  connectes?: Connecte[];
  /**
   * Ma fiche de référent, et si elle porte un visage (migration 0047). `null`
   * pour qui n'a pas de fiche.
   */
  photo?: MaPhoto | null;
}) {
  const chemin = usePathname() ?? '';
  const familles = famillesDuRole(profil.role);
  const nom = nomAffichable(profil.prenom, profil.nom, profil.email);

  return (
    <nav className="colonne" aria-label="Navigation principale">
      <div className="colonne-marque">
        <span className={logo ? 'logo' : 'logo logo--absent'} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" /> : 'H'}
        </span>
        <span className="colonne-titre">HERACLES</span>
        {nom && <span className="colonne-qui">{nom}</span>}

        {/* Votre visage, sous votre nom — ou sous votre adresse, faute de nom.
            `alt` vide à dessein : le nom est juste au-dessus, et le faire
            relire par un lecteur d'écran ne dirait rien de plus.

            Rien du tout quand la fiche ne porte pas de photo rapatriée. Un
            cadre vide, ou une silhouette, laisserait croire à une image qui ne
            charge pas — alors qu'il n'y a simplement rien à montrer. */}
        {photo?.a_une_photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="colonne-portrait"
            src={`/espace/referents/${photo.referent_id}/photo`}
            alt=""
            width={44}
            height={44}
          />
        )}
      </div>

      {/* Sous son propre nom : les autres. Le premier rendu vient du serveur,
          la suite d'un rafraîchissement toutes les trente secondes. */}
      <Connectes initiaux={connectes} />

      <Link
        href="/espace/accueil"
        aria-current={chemin === '/espace/accueil' ? 'page' : undefined}
        className={`colonne-entree${chemin === '/espace/accueil' ? ' colonne-entree--courante' : ''}`}
      >
        Accueil
      </Link>

      {familles.map((famille) => (
        <div key={famille.nom} className="colonne-famille">
          <p className="colonne-famille-nom">{famille.nom}</p>

          {famille.entrees.map((entree) =>
            entree.vers ? (
              <Link
                key={entree.libelle}
                href={entree.vers}
                aria-current={estCourante(entree, chemin) ? 'page' : undefined}
                className={`colonne-entree${estCourante(entree, chemin) ? ' colonne-entree--courante' : ''}`}
              >
                {entree.libelle}
              </Link>
            ) : (
              <span
                key={entree.libelle}
                className="colonne-entree colonne-entree--eteinte"
                title={`À venir — ${entree.lot ?? 'plus tard'}`}
              >
                {entree.libelle}
              </span>
            ),
          )}
        </div>
      ))}

      {/* En bas de la colonne, et à part : on ne cherche pas ses réglages en
          parcourant les familles, on les cherche là où ils sont toujours. */}
      <Link
        href={PARAMETRES.vers}
        aria-current={estCourante(PARAMETRES, chemin) ? 'page' : undefined}
        className={`colonne-entree colonne-parametres${
          estCourante(PARAMETRES, chemin) ? ' colonne-entree--courante' : ''
        }`}
      >
        <Roue />
        {PARAMETRES.libelle}
      </Link>
    </nav>
  );
}
