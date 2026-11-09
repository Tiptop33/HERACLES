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
import { exigerProfil } from '@/lib/profil';

export const metadata = { title: 'Accueil — HERACLES' };

type Parametres = Promise<{
  effacer?: string | string[];
  document?: string | string[];
  /** « fermee » : la fenêtre d'archivage ne s'ouvre pas cette fois-ci. */
  fenetre?: string | string[];
  /** Ce que la route d'archivage a répondu, quand elle a refusé. */
  archivage?: string | string[];
}>;

const premier = (valeur: string | string[] | undefined) =>
  (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';

export default async function Accueil({ searchParams }: { searchParams: Parametres }) {
  const profil = await exigerProfil();
  const parametres = await searchParams;

  const [chiffres, demandes, archives, offres, aArchiver] = await Promise.all([
    lireChiffres(),
    listerDemandesEnAttente(4),
    listerLesArchives(),
    listerOffresEnCours(5),
    listerLesDossiersAArchiver(),
  ]);

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
      // La fenêtre d'archivage (0071) : « Fermer » la retire pour cette fois,
      // elle revient au passage suivant tant qu'un dossier attend.
      aArchiver={premier(parametres.fenetre) === 'fermee' ? [] : aArchiver}
      refusDArchivage={phraseDeRefusDArchivage(premier(parametres.archivage))}
      estReferent={profil.role === 'referent'}
    />
  );
}
