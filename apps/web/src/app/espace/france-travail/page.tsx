import { redirect } from 'next/navigation';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'France Travail — HERACLES' };

/**
 * L'écran « France Travail » — l'ancien « Offres externes » de Bubble, renommé
 * le 23 novembre 2026, à la demande : les offres externes viennent toutes de
 * France Travail, autant le dire.
 *
 * Pour l'instant, l'écran ne porte que son en-tête : le logo de France
 * Travail, centré, qui tient lieu de titre. Il ne lit rien dans la base ; la liste des offres viendra
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
        {/* Le logo tient lieu de titre (23 novembre 2026, à la demande) : il
            porte déjà le nom en toutes lettres. Il reste dans un `<h1>`, avec
            son `alt`, pour qu'un lecteur d'écran annonce l'écran.
            `<img>` et non `next/image` : un SVG de cinq kilo-octets, il n'y a
            rien à optimiser. */}
        <h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-france-travail" src="/logo-france-travail.svg" alt="France Travail" />
        </h1>
      </div>
    </main>
  );
}
