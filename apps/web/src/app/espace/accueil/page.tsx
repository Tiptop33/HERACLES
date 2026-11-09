import VueAccueil from '@/components/VueAccueil';
import {
  lireChiffres,
  listerDemandesEnAttente,
  listerLesArchives,
  listerOffresEnCours,
  saison,
} from '@/lib/accueil';
import { phraseDeRefusDocument, SORTES } from '@/lib/documents/archives';
import { exigerProfil } from '@/lib/profil';

export const metadata = { title: 'Accueil — HERACLES' };

type Parametres = Promise<{ effacer?: string | string[]; document?: string | string[] }>;

const premier = (valeur: string | string[] | undefined) =>
  (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';

export default async function Accueil({ searchParams }: { searchParams: Parametres }) {
  const profil = await exigerProfil();
  const parametres = await searchParams;

  const [chiffres, demandes, archives, offres] = await Promise.all([
    lireChiffres(),
    listerDemandesEnAttente(4),
    listerLesArchives(),
    listerOffresEnCours(5),
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
      estReferent={profil.role === 'referent'}
    />
  );
}
