import { notFound } from 'next/navigation';
import ListeDesCandidatsRefermes from '@/components/ListeDesCandidatsRefermes';
import OngletsDesArchives from '@/components/OngletsDesArchives';
import { listerLesPdfAnterieurs } from '@/lib/accueil';
import { estUneListeRefermee } from '@/lib/candidats-refermes';
import { totalDesColonnes } from '@/lib/documents/archives';
import { listerLesDossiersRefermes } from '@/lib/poste';

export const metadata = { title: 'Archives — Paramètres — HERACLES' };

/**
 * Paramètres › Archives › « Candidat Clôturé » et « Candidat Archivé » : tous
 * les dossiers refermés, de toutes les loges pour l'administration, rangés
 * comme les pastilles « Clôturés » et « Archivés » de l'écran Candidats.
 *
 * Aucune lecture nouvelle : la liste de l'écran Candidats
 * (`candidats_de_la_loge()`), filtrée par la même règle.
 */
export default async function CandidatsRefermes({ params }: { params: Promise<{ liste: string }> }) {
  const { liste } = await params;
  if (!estUneListeRefermee(liste)) notFound();

  // Les PDF aussi, pour le nombre du bouton « Archives ».
  const [listes, { colonnes }] = await Promise.all([
    listerLesDossiersRefermes(),
    listerLesPdfAnterieurs(),
  ]);

  return (
    <>
      <OngletsDesArchives
        courant={liste}
        nombres={{
          pdf: totalDesColonnes(colonnes),
          'candidats-clotures': listes['candidats-clotures'].length,
          'candidats-archives': listes['candidats-archives'].length,
        }}
      />
      <p className="aide">
        {liste === 'candidats-clotures'
          ? 'Les dossiers clôturés et pas archivés, comme la pastille « Clôturés » de l’écran Candidats.'
          : 'Les dossiers archivés, comme la pastille « Archivés » de l’écran Candidats.'}{' '}
        Un clic ouvre la fiche dans l’écran Candidats. « ≈ » : date approchée, reprise de
        Bubble, qui ne datait ni les clôtures ni les archivages.
      </p>

      <section className="bloc">
        <ListeDesCandidatsRefermes lignes={listes[liste]} liste={liste} />
      </section>
    </>
  );
}
