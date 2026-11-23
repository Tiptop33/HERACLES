import Link from 'next/link';
import { redirect } from 'next/navigation';
import ListeDesOffres from '@/components/ListeDesOffres';
import OffreOuverte from '@/components/OffreOuverte';
import {
  adresseDesOffres,
  estFiltre,
  lireFiltres,
  lireIdentifiantDOffre,
  menusAAfficher,
  nombreDePages,
} from '@/lib/offres';
import { lireMenusDesOffres, lireOffre, lirePageDOffres } from '@/lib/offres-serveur';
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
 * dessous, une recherche par mots et deux filtres — un ou plusieurs
 * départements, un secteur d'activité — puis la liste des offres en cours qui
 * y répondent : actualisées depuis
 * moins de trente jours, les plus récentes d'abord, cinquante par page. Sous
 * la liste, de quoi passer d'une page à l'autre, jusqu'à la dernière.
 *
 * La recherche, les filtres et la page vivent dans l'adresse
 * (`?q=boulanger&dep=33,47&secteur=F&page=2`). Toucher une offre en ouvre le
 * détail dans une fenêtre flottante (`&offre=…`), lu dans la table sous RLS. Tout passe par
 * la base (migration 0097), avec la session de la personne : c'est elle qui
 * refuse un compte chercheur, range chaque offre dans son département et son
 * secteur, et borne la liste. Une offre ne dit rien de personne.
 *
 * Un compte chercheur n'a pas cet écran — il est renvoyé chez lui, comme pour
 * les autres écrans de l'espace de travail.
 */
export default async function FranceTravail({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    dep?: string | string[];
    secteur?: string | string[];
    page?: string | string[];
    offre?: string | string[];
  }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const filtres = lireFiltres(parametres);
  // L'offre dont le détail est demandé. Elle se lit à la base, jamais dans la
  // liste : l'adresse peut venir d'un favori, la page de la liste avoir changé.
  const demandee = lireIdentifiantDOffre(parametres.offre);
  const [menus, page, offre] = await Promise.all([
    lireMenusDesOffres(),
    lirePageDOffres(filtres),
    demandee ? lireOffre(demandee) : null,
  ]);

  // Une page au-delà de la dernière — une adresse gardée en favori, des offres
  // expirées depuis : on ramène à la dernière, plutôt que de montrer du vide.
  const pages = page ? nombreDePages(page.total) : 1;
  if (page && filtres.page > pages) redirect(adresseDesOffres({ ...filtres, page: pages }, demandee));

  const filtre = estFiltre(filtres);

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

      {/* Sans les menus — la base ne les a pas rendus — la recherche reste :
          elle n'en dépend pas. */}
      <FiltresDesOffres
        filtres={filtres}
        menus={menus ? menusAAfficher(menus, filtres) : { departements: filtres.departements, secteurs: [] }}
        menusLus={menus !== null}
      />

      <section className="bloc">
        <h2>Offres d&apos;emploi en cours</h2>
        {page ? (
          <ListeDesOffres
            offres={page.offres}
            vide={filtre ? 'Aucune offre en cours pour ce choix.' : undefined}
            lien={(id) => adresseDesOffres(filtres, id)}
            ouverte={demandee}
          />
        ) : (
          <p className="erreur" role="alert">
            La liste des offres n’a pas pu être lue. Réessayez dans un instant.
          </p>
        )}
      </section>

      {/* Rien quand tout tient en une page : deux liens éteints sous cinq
          offres ne diraient rien. Des liens, pas des boutons : chaque page a
          son adresse. */}
      {page && pages > 1 && (
        <nav className="pages-des-offres" aria-label="Pages des offres">
          {filtres.page > 1 ? (
            <Link className="filtre" href={adresseDesOffres({ ...filtres, page: filtres.page - 1 })} rel="prev">
              ← Précédente
            </Link>
          ) : (
            <span className="filtre pages-des-offres-eteint" aria-disabled="true">
              ← Précédente
            </span>
          )}
          <span className="maigre" aria-current="page">
            Page {filtres.page} sur {pages}
          </span>
          {filtres.page < pages ? (
            <Link className="filtre" href={adresseDesOffres({ ...filtres, page: filtres.page + 1 })} rel="next">
              Suivante →
            </Link>
          ) : (
            <span className="filtre pages-des-offres-eteint" aria-disabled="true">
              Suivante →
            </span>
          )}
        </nav>
      )}

      {demandee && (
        <OffreOuverte demandee={demandee} offre={offre} fermer={adresseDesOffres(filtres)} />
      )}
    </main>
  );
}

