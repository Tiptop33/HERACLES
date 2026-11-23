import { redirect } from 'next/navigation';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'France Travail — HERACLES' };

/**
 * L'écran « France Travail » — l'ancien « Offres externes » de Bubble, renommé
 * le 23 novembre 2026, à la demande : les offres externes viennent toutes de
 * France Travail, autant le dire.
 *
 * Pour l'instant, l'écran ne porte que son en-tête : le titre et le logo de
 * France Travail. Il ne lit rien dans la base ; la liste des offres viendra
 * avec sa propre demande, et sa propre policy.
 *
 * Un compte chercheur n'a pas cet écran — il est renvoyé chez lui, comme pour
 * les autres écrans de l'espace de travail.
 */
export default async function FranceTravail() {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  return (
    <main className="corps">
      <div className="entete-liste entete-france-travail">
        <h1>France Travail</h1>
        {/* `alt` vide : le nom est écrit juste à côté, en toutes lettres.
            `<img>` et non `next/image` : un SVG de cinq kilo-octets, il n'y a
            rien à optimiser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-france-travail" src="/logo-france-travail.svg" alt="" />
      </div>
    </main>
  );
}
