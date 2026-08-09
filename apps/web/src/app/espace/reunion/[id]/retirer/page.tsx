import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { dateEnLettres } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { lireRegistre } from '@/lib/reunion';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Retirer une réunion — HERACLES' };

/**
 * La confirmation avant de retirer une réunion du registre.
 *
 * Une page, et non une fenêtre pilotée par JavaScript : le geste efface
 * quinze pointages d'un coup, il doit fonctionner et s'afficher partout, y
 * compris pendant que la page charge. L'adresse dit ce qu'on est en train de
 * faire, et le bouton « Annuler » est un simple retour.
 *
 * Elle dit **ce qu'on perd**, chiffres à l'appui, plutôt que « êtes-vous
 * sûr ? » — une question à laquelle on répond oui sans lire.
 */
export default async function RetirerUneReunion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profil = await exigerProfil();
  if (profil.role === 'chercheur') redirect(accueilDuRole(profil.role));

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Le registre complet : une réunion déjà retirée s'y trouve encore, et
  // c'est depuis cette même page qu'on peut la rendre.
  const reunion = (await lireRegistre(true)).find((r) => r.id === id);
  if (!reunion) notFound();

  const pointes = reunion.presents + reunion.excuses;

  if (reunion.retiree) {
    return (
      <main className="corps corps--etroit">
        <h1>Rendre la réunion du {dateEnLettres(reunion.tenue_le)} ?</h1>
        <p>
          Elle a été retirée du registre
          {reunion.retire_par_nom ? ` par ${reunion.retire_par_nom}` : ''}. Ses{' '}
          {pointes} pointage{pointes > 1 ? 's' : ''} n’ont jamais quitté la base : la
          rendre les remet au compte de l’exercice.
        </p>

        <div className="gestes" style={{ marginTop: '1.2rem' }}>
          <Link className="bouton" href="/espace/reunion">
            Annuler
          </Link>
          <form method="post" action={`/api/reunions/${reunion.id}/retirer`}>
            <input type="hidden" name="geste" value="rendre" />
            <input type="hidden" name="retour" value="/espace/reunion" />
            <button className="bouton bouton--fort" type="submit">
              Rendre au registre
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="corps corps--etroit">
      <h1>Retirer la réunion du {dateEnLettres(reunion.tenue_le)} ?</h1>

      <p>
        {pointes === 0 ? (
          <>Personne n’a encore été appelé à cette réunion.</>
        ) : (
          <>
            <strong>
              {reunion.presents} présence{reunion.presents > 1 ? 's' : ''} et{' '}
              {reunion.excuses} excuse{reunion.excuses > 1 ? 's' : ''}
            </strong>{' '}
            seront retirées des compteurs de l’exercice, et cette réunion n’apparaîtra
            plus au registre.
          </>
        )}
      </p>

      {/* Ce que le mot « retirer » veut dire ici, écrit en toutes lettres :
          promettre une suppression qui n'en est pas serait pire que de ne
          rien dire. */}
      <p className="aide">
        Retirer n’est pas effacer. L’appel reste en base, et cette même page permettra
        de rendre la réunion au registre.
      </p>

      <div className="gestes" style={{ marginTop: '1.2rem' }}>
        <Link className="bouton" href="/espace/reunion">
          Annuler
        </Link>
        <form method="post" action={`/api/reunions/${reunion.id}/retirer`}>
          <input type="hidden" name="geste" value="retirer" />
          <input type="hidden" name="retour" value="/espace/reunion" />
          <button className="bouton bouton--danger" type="submit">
            Retirer du registre
          </button>
        </form>
      </div>
    </main>
  );
}
