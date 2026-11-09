import { notFound } from 'next/navigation';
import ListeDesCandidatsRefermes from '@/components/ListeDesCandidatsRefermes';
import OngletsDesArchives from '@/components/OngletsDesArchives';
import { estUneListeRefermee, LISTES_REFERMEES } from '@/lib/candidats-refermes';
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

  const listes = await listerLesDossiersRefermes();

  return (
    <>
      <OngletsDesArchives
        courant={liste}
        nombres={{
          'candidats-clotures': listes['candidats-clotures'].length,
          'candidats-archives': listes['candidats-archives'].length,
        }}
      />
      <p className="aide">
        {liste === 'candidats-clotures'
          ? 'Les dossiers clôturés et pas archivés, comme la pastille « Clôturés » de l’écran Candidats.'
          : 'Les dossiers archivés, comme la pastille « Archivés » de l’écran Candidats.'}{' '}
        Un clic ouvre la fiche dans l’écran Candidats.
      </p>

      <section className="bloc">
        <ListeDesCandidatsRefermes
          lignes={listes[liste]}
          vide={LISTES_REFERMEES[liste].vide}
        />
      </section>
    </>
  );
}
