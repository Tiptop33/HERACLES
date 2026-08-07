'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { estCourante, famillesDuRole } from '@/lib/navigation';
import { nomComplet } from '@/lib/format';
import type { Profil } from '@/lib/profil';

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
export default function Colonne({ profil, logo }: { profil: Profil; logo: string | null }) {
  const chemin = usePathname() ?? '';
  const familles = famillesDuRole(profil.role);
  const nom = nomComplet(profil.prenom, profil.nom);

  return (
    <nav className="colonne" aria-label="Navigation principale">
      <div className="colonne-marque">
        <span className={logo ? 'logo' : 'logo logo--absent'} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" /> : 'H'}
        </span>
        <span className="colonne-titre">HERACLES</span>
        {nom && <span className="colonne-qui">{nom}</span>}
      </div>

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
    </nav>
  );
}
