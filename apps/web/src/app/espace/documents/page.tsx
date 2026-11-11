import Link from 'next/link';
import { redirect } from 'next/navigation';
import ColonnesDesArchives from '@/components/ColonnesDesArchives';
import FenetreDEffacement from '@/components/FenetreDEffacement';
import { listerLesArchives, saison } from '@/lib/accueil';
import { phraseDeRefusDocument, SORTES } from '@/lib/documents/archives';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Documents — HERACLES' };

const ADRESSE = '/espace/documents';

type Parametres = Promise<{ effacer?: string | string[]; document?: string | string[] }>;

const premier = (valeur: string | string[] | undefined) =>
  (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';

/**
 * Les documents de la loge — comptes rendus, affiches et affichettes de
 * l'exercice en cours —, sur un écran à eux.
 *
 * C'est ce qu'ouvrent l'onglet « Documents » de la barre du téléphone et
 * l'entrée « Documents » de la colonne de gauche, famille « Réseau ». Rien
 * n'y est nouveau : le même tableau que celui de l'accueil, lu par la même
 * fonction de la base, donc avec les mêmes droits — un référent n'y voit que
 * les PDF de sa loge, et la corbeille n'y paraît que là où la base l'accorde.
 * L'accueil garde son tableau ; celui-ci évite seulement de le chercher sous
 * les compteurs et les urgences.
 *
 * Les exercices précédents restent dans Paramètres › Archives, réservé à
 * l'administration : le lien n'est proposé qu'à elle.
 */
export default async function Documents({ searchParams }: { searchParams: Parametres }) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const colonnes = await listerLesArchives();

  // La fenêtre d'effacement ne s'ouvre que sur une ligne que la base a dite
  // effaçable — comme à l'accueil.
  const demande = premier(parametres.effacer);
  const aEffacer =
    SORTES.flatMap((sorte) => colonnes[sorte]).find((d) => d.id === demande && d.effacable) ??
    null;
  const refus = phraseDeRefusDocument(premier(parametres.document));

  return (
    <main className="corps">
      <div>
        <h1>Documents</h1>
        <span className="compte">
          Comptes-rendus, affiches et affichettes · saison {saison()}
        </span>
      </div>

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      <section className="bloc" data-aide="documents-commission">
        <ColonnesDesArchives colonnes={colonnes} adresse={ADRESSE} />
      </section>

      {profil.role === 'admin' && (
        <p className="aide">
          Les exercices précédents sont dans{' '}
          <Link href="/espace/parametres/archives">Paramètres › Archives</Link>.
        </p>
      )}

      {aEffacer && <FenetreDEffacement archive={aEffacer} adresse={ADRESSE} />}
    </main>
  );
}
