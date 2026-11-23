import { redirect } from 'next/navigation';
import ListeDesOffres from '@/components/ListeDesOffres';
import { listerOffresEnCours } from '@/lib/accueil';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'France Travail — HERACLES' };

/**
 * L'écran « France Travail » — l'ancien « Offres externes » de Bubble, renommé
 * le 23 novembre 2026, à la demande : les offres externes viennent toutes de
 * France Travail, autant le dire.
 *
 * En haut, le logo de France Travail, centré, qui tient lieu de titre. En
 * dessous, la liste des offres en cours — la même qu'à l'accueil, lue sous RLS
 * par la même requête : les offres actualisées depuis moins de trente jours,
 * les plus récentes d'abord. L'accueil en montre cinq ; ici, les cinquante
 * premières. Une offre ne dit rien de personne : ni candidat, ni référent.
 *
 * Un compte chercheur n'a pas cet écran — il est renvoyé chez lui, comme pour
 * les autres écrans de l'espace de travail.
 */
/** Au-delà, il faudra des pages ou une recherche — pas une liste sans fin. */
const LIMITE = 50;

export default async function FranceTravail() {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const offres = await listerOffresEnCours(LIMITE);

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

      <section className="bloc">
        <h2>Offres d&apos;emploi en cours</h2>
        <ListeDesOffres offres={offres} />
      </section>
    </main>
  );
}
