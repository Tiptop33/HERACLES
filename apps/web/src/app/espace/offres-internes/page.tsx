import { redirect } from 'next/navigation';
import ListeDesOffres from '@/components/ListeDesOffres';
import OffreOuverte from '@/components/OffreOuverte';
import SaisirUneOffre from '@/components/SaisirUneOffre';
import { lireIdentifiantDOffre } from '@/lib/offres';
import { lireOffre } from '@/lib/offres-serveur';
import {
  lireLesOffresEchues,
  lireLesOffresInternesEnCours,
  lireOffreAModifierDe,
} from '@/lib/offres-saisies-serveur';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Offres internes — HERACLES' };

const ICI = '/espace/offres-internes';

/**
 * L'écran « Offres internes » : les offres d'emploi, de stage ou de stage en
 * alternance que référents et administration saisissent à la main (0114,
 * 0115 ; décisions du 27 novembre 2026). Grisé jusque-là dans la famille
 * « Emploi » ; les offres de France Travail restent sur « France Travail ».
 *
 * Une liste simple, sans recherche ni filtre — elles sont peu nombreuses :
 *
 *   · « + Saisir une offre », en tête, ouvre la fenêtre de saisie
 *     (proposition A de la planche) ;
 *   · les offres en ligne, de tous les référents, chacune avec l'étiquette de
 *     son type ;
 *   · dessous, seulement s'il y en a, celles qui ont passé leurs trente
 *     jours — les siennes pour un référent, toutes pour l'administration —,
 *     à prolonger ou à retirer.
 *
 * Toucher une offre en ouvre le détail dans une fenêtre flottante
 * (`?offre=…`) ; son auteur et l'administration y trouvent Modifier,
 * Prolonger, Retirer. La base dit qui peut quoi : la page ne fait qu'afficher.
 *
 * Un compte chercheur n'a pas cet écran — il est renvoyé chez lui.
 */
export default async function OffresInternes({
  searchParams,
}: {
  searchParams: Promise<{ offre?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const demandee = lireIdentifiantDOffre((await searchParams).offre);
  const [enCours, echues, offre, gestes] = await Promise.all([
    lireLesOffresInternesEnCours(),
    lireLesOffresEchues(),
    demandee ? lireOffre(demandee) : null,
    // L'offre que la personne peut modifier : `null` pour toute autre.
    demandee ? lireOffreAModifierDe(demandee) : null,
  ]);
  const lien = (id: string) => `${ICI}?offre=${id}`;

  return (
    <main className="corps">
      <div className="entete-liste">
        <h1>Offres internes</h1>
      </div>

      <section className="bloc">
        <div className="bloc-tete">
          <h2>Offres d&apos;emploi en cours</h2>
          <SaisirUneOffre />
        </div>
        {enCours ? (
          <ListeDesOffres offres={enCours} lien={lien} ouverte={demandee} />
        ) : (
          <p className="erreur" role="alert">
            La liste des offres n’a pas pu être lue. Réessayez dans un instant.
          </p>
        )}
      </section>

      {/* Les offres qui ont passé leurs trente jours : on les retrouve ici
          pour les prolonger ou les retirer. Rien quand il n'y en a pas. */}
      {echues.length > 0 && (
        <section className="bloc">
          <h2>Offres saisies sorties de la liste</h2>
          <ListeDesOffres offres={echues} lien={lien} ouverte={demandee} />
        </section>
      )}

      {demandee && <OffreOuverte demandee={demandee} offre={offre} fermer={ICI} gestes={gestes} />}
    </main>
  );
}
