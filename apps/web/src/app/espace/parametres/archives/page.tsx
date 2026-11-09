import ColonnesDesArchives from '@/components/ColonnesDesArchives';
import FenetreDEffacement from '@/components/FenetreDEffacement';
import OngletsDesArchives from '@/components/OngletsDesArchives';
import { listerLesPdfAnterieurs } from '@/lib/accueil';
import { phraseDeRefusDocument, SORTES, totalDesColonnes } from '@/lib/documents/archives';
import { dateEnLettres } from '@/lib/format';
import { RUBRIQUES } from '@/lib/parametres';
import { listerLesDossiersRefermes } from '@/lib/poste';

export const metadata = { title: 'Archives — Paramètres — HERACLES' };

const ADRESSE = '/espace/parametres/archives';

type Parametres = Promise<{ effacer?: string | string[]; document?: string | string[] }>;

const premier = (valeur: string | string[] | undefined) =>
  (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';

/**
 * Les comptes rendus, affiches et affichettes des exercices précédents — le
 * même tableau à trois colonnes que l'accueil, pour tout ce qui précède
 * l'exercice réglé dans Paramètres › Exercice.
 *
 * Les deux écrans ne se recouvrent pas : un PDF est à l'accueil pendant son
 * exercice, ici ensuite. Aucune règle d'accès nouvelle : la même fonction de
 * la base, avec d'autres bornes, et la même corbeille.
 */
export default async function Archives({ searchParams }: { searchParams: Parametres }) {
  const parametres = await searchParams;
  const [{ periode, colonnes }, refermes] = await Promise.all([
    listerLesPdfAnterieurs(),
    listerLesDossiersRefermes(),
  ]);

  // La fenêtre d'effacement ne s'ouvre que sur une ligne que la base a dite
  // effaçable — comme à l'accueil.
  const demande = premier(parametres.effacer);
  const aEffacer =
    SORTES.flatMap((sorte) => colonnes[sorte]).find((d) => d.id === demande && d.effacable) ??
    null;

  const refus = phraseDeRefusDocument(premier(parametres.document));
  const propos = RUBRIQUES.find((r) => r.libelle === 'Archives')?.propos ?? '';

  return (
    <>
      <OngletsDesArchives
        courant="pdf"
        nombres={{
          pdf: totalDesColonnes(colonnes),
          'candidats-clotures': refermes['candidats-clotures'].length,
          'candidats-archives': refermes['candidats-archives'].length,
        }}
      />
      <p className="aide">
        {propos} Ici, tout ce qui est daté d’avant le {dateEnLettres(periode.du) ?? periode.du},
        du plus récent au plus ancien.
      </p>

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      <section className="bloc">
        <ColonnesDesArchives colonnes={colonnes} adresse={ADRESSE} avant compter recherche enTeteFixe />
      </section>

      {aEffacer && <FenetreDEffacement archive={aEffacer} adresse={ADRESSE} />}
    </>
  );
}
