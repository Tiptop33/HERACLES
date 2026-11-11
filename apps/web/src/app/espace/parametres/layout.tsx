import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import { RUBRIQUES } from '@/lib/parametres';
import MenuParametres from './MenuParametres';

/**
 * Les paramètres, en deux volets : le menu des rubriques à gauche, la rubrique
 * ouverte à droite.
 *
 * Un layout et non une page : le menu ne se recharge pas d'une rubrique à
 * l'autre, et chaque rubrique reste une adresse à part — qui se partage, se
 * met en favori, et revient avec le bouton « retour ».
 *
 * Réservé aux administrateurs. Un référent n'a rien à régler ici : ce sont les
 * listes de toute la loge. Le contrôle est doublé côté base — policy
 * `college_ecriture_admin` (0017) —, celui-ci ne fait qu'éviter d'afficher une
 * porte fermée.
 */
export default async function ParametresLayout({ children }: { children: React.ReactNode }) {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));

  return (
    <main className="corps parametres">
      <div>
        <h1>Paramètres</h1>
        <span className="compte">les listes que l&apos;application propose partout ailleurs</span>
      </div>

      <div className="parametres-deux-volets">
        <MenuParametres rubriques={RUBRIQUES} />
        <div className="parametres-contenu">{children}</div>
      </div>

      <p className="aide">
        {/* Ce que « Mon compte » règle vraiment : il n'a de champ ni pour
            l'adresse électronique ni pour le mot de passe. */}
        <Link href="/mon-compte">Mon compte</Link> — votre nom, votre téléphone, votre
        photo. C&apos;est ailleurs : ce qui se règle ici vaut pour tout le monde.
      </p>
    </main>
  );
}
