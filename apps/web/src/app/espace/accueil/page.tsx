import VueAccueil from '@/components/VueAccueil';
import {
  lireChiffres,
  listerDemandesEnAttente,
  listerLesArchives,
  listerLesDossiersAArchiver,
  listerOffresEnCours,
  phraseDeRefusDArchivage,
  saison,
} from '@/lib/accueil';
import { phraseDeRefusDocument, SORTES } from '@/lib/documents/archives';
import { lireIdentifiantDOffre } from '@/lib/offres';
import { lireOffre } from '@/lib/offres-serveur';
import { exigerProfil } from '@/lib/profil';

export const metadata = { title: 'Accueil — HERACLES' };

type Parametres = Promise<{
  effacer?: string | string[];
  document?: string | string[];
  /** « fermee » : la fenêtre d'archivage ne s'ouvre pas cette fois-ci. */
  fenetre?: string | string[];
  /** Ce que la route d'archivage a répondu, quand elle a refusé. */
  archivage?: string | string[];
  /** L'offre dont le détail est ouvert, dans sa fenêtre flottante. */
  offre?: string | string[];
}>;

const premier = (valeur: string | string[] | undefined) =>
  (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';

export default async function Accueil({ searchParams }: { searchParams: Parametres }) {
  const profil = await exigerProfil();
  const parametres = await searchParams;

  // L'offre dont le détail est demandé. Elle se lit à la base, sous RLS, et
  // non dans la liste des cinq : l'adresse peut dater d'hier.
  const offreDemandee = lireIdentifiantDOffre(parametres.offre);

  const [chiffres, demandes, archives, offres, aArchiver, offre] = await Promise.all([
    lireChiffres(),
    listerDemandesEnAttente(4),
    listerLesArchives(),
    listerOffresEnCours(5),
    listerLesDossiersAArchiver(),
    offreDemandee ? lireOffre(offreDemandee) : null,
  ]);

  // Ouvrir ou fermer une offre ne doit pas faire revenir la fenêtre
  // d'archivage qu'on vient de fermer : son « fermée » suit dans l'adresse.
  const fenetreFermee = premier(parametres.fenetre) === 'fermee';
  const adresse = (id: string | null) => {
    const p = new URLSearchParams();
    if (fenetreFermee) p.set('fenetre', 'fermee');
    if (id) p.set('offre', id);
    const suite = p.toString();
    return suite ? `/espace/accueil?${suite}` : '/espace/accueil';
  };

  // La fenêtre d'effacement ne s'ouvre que sur une ligne que la base a dite
  // effaçable : une adresse fabriquée ne fait pas paraître de bouton rouge sur
  // le PDF d'une autre loge.
  const demande = premier(parametres.effacer);
  const aEffacer =
    SORTES.flatMap((sorte) => archives[sorte]).find((d) => d.id === demande && d.effacable) ??
    null;

  return (
    <VueAccueil
      saison={saison()}
      chiffres={chiffres}
      demandes={demandes}
      archives={archives}
      aEffacer={aEffacer}
      refusDArchive={phraseDeRefusDocument(premier(parametres.document))}
      offres={offres}
      // Les offres de l'accueil ouvrent leur détail (23 novembre 2026, à la
      // demande), dans la même fenêtre flottante que l'écran France Travail.
      lienDeLOffre={(id) => adresse(id)}
      offreDemandee={offreDemandee}
      offre={offre}
      fermerLOffre={adresse(null)}
      // La fenêtre d'archivage (0071) : « Fermer » la retire pour cette fois,
      // elle revient au passage suivant tant qu'un dossier attend.
      aArchiver={fenetreFermee ? [] : aArchiver}
      refusDArchivage={phraseDeRefusDArchivage(premier(parametres.archivage))}
      estReferent={profil.role === 'referent'}
    />
  );
}
