import { redirect } from 'next/navigation';
import ListeDesOffres from '@/components/ListeDesOffres';
import { lireFiltres, menusAAfficher } from '@/lib/offres';
import { lireMenusDesOffres, listerOffresFiltrees } from '@/lib/offres-serveur';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import FiltresDesOffres from './FiltresDesOffres';

export const metadata = { title: 'France Travail — HERACLES' };

/**
 * L'écran « France Travail » — l'ancien « Offres externes » de Bubble, renommé
 * le 23 novembre 2026, à la demande : les offres externes viennent toutes de
 * France Travail, autant le dire.
 *
 * En haut, le logo de France Travail, centré, qui tient lieu de titre. En
 * dessous, deux filtres — un ou plusieurs départements, un secteur d'activité
 * — puis la liste des offres en cours qui y répondent : actualisées depuis
 * moins de trente jours, les plus récentes d'abord, cinquante au plus.
 *
 * Les filtres vivent dans l'adresse (`?dep=33,47&secteur=F`). Tout passe par
 * la base (migration 0097), avec la session de la personne : c'est elle qui
 * refuse un compte chercheur, range chaque offre dans son département et son
 * secteur, et borne la liste. Une offre ne dit rien de personne.
 *
 * Un compte chercheur n'a pas cet écran — il est renvoyé chez lui, comme pour
 * les autres écrans de l'espace de travail.
 */
/** Au-delà, il faudra des pages ou une recherche — pas une liste sans fin. */
const LIMITE = 50;

export default async function FranceTravail({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string | string[]; secteur?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const filtres = lireFiltres(await searchParams);
  const [menus, offres] = await Promise.all([
    lireMenusDesOffres(),
    listerOffresFiltrees(filtres, LIMITE),
  ]);
  const filtre = filtres.departements.length > 0 || filtres.secteur !== '';

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

      {menus && <FiltresDesOffres filtres={filtres} menus={menusAAfficher(menus, filtres)} />}

      <section className="bloc">
        <h2>Offres d&apos;emploi en cours</h2>
        {offres ? (
          <ListeDesOffres
            offres={offres}
            vide={filtre ? 'Aucune offre en cours pour ce choix.' : undefined}
          />
        ) : (
          <p className="erreur" role="alert">
            La liste des offres n’a pas pu être lue. Réessayez dans un instant.
          </p>
        )}
      </section>
    </main>
  );
}
