import Link from 'next/link';
import { redirect } from 'next/navigation';
import { referentCourant } from '@/lib/candidat';
import { courrielConfigure } from '@/lib/courriel';
import { dateEnLettres, depuis } from '@/lib/format';
import { ETATS, type EtatDuParrainage } from '@/lib/parrainage';
import { listerParrainages } from '@/lib/parrainage-serveur';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import BoutonRenvoyer from './BoutonRenvoyer';
import InviterParrain from './InviterParrain';

export const metadata = { title: 'Nouveau candidat — HERACLES' };

/**
 * Ouvrir un dossier, comme Bubble le faisait (migration 0057) : le référent
 * invite un parrain, le parrain présente le candidat, le candidat complète sa
 * fiche. Chacun reçoit son lien par courriel.
 *
 * L'écran montre aussi où en est chaque invitation de la loge — c'était la
 * liste « Parrainages » du tableau de bord de Bubble.
 */

/** Ce que les routes ont répondu à un envoi sans script. */
const MESSAGES: Record<string, { classe: 'encart' | 'erreur'; texte: string }> = {
  envoye: { classe: 'encart', texte: 'Le lien est parti chez le parrain.' },
  renvoye: { classe: 'encart', texte: 'Un nouveau lien est parti chez le candidat.' },
  adresse: { classe: 'erreur', texte: 'Cette adresse e-mail n’est pas valide.' },
  'sans-loge': { classe: 'erreur', texte: 'Votre compte n’est rattaché à aucune loge.' },
  'non-envoye': {
    classe: 'erreur',
    texte:
      'Le courriel n’est pas parti. Recommencez avec le script activé : le lien s’affichera pour que vous le transmettiez vous-même.',
  },
  introuvable: { classe: 'erreur', texte: 'Ce dossier n’attend plus de réponse.' },
  echec: { classe: 'erreur', texte: 'L’opération a échoué. Réessayez dans un instant.' },
};

const CLASSE_D_ETAT: Record<EtatDuParrainage, 'suivi' | 'attente' | 'clos'> = {
  attente_parrain: 'attente',
  attente_candidat: 'attente',
  complete: 'suivi',
  expire: 'clos',
  revoque: 'clos',
};

export default async function NouveauCandidat({
  searchParams,
}: {
  searchParams: Promise<{ envoye?: string; renvoye?: string; erreur?: string }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'referent' && profil.role !== 'admin') redirect(accueilDuRole(profil.role));

  const moi = await referentCourant();
  const parametres = await searchParams;
  const code = parametres.envoye ? 'envoye' : parametres.renvoye ? 'renvoye' : parametres.erreur;
  const message = code ? MESSAGES[code] : null;

  return (
    <main className="corps">
      <p className="fil">
        <Link href="/espace/candidats">Candidats</Link> <span aria-hidden="true">›</span>{' '}
        <span>Nouveau candidat</span>
      </p>

      <div className="entete-liste">
        <div>
          <h1>Nouveau candidat</h1>
          <span className="compte">
            Le parrain présente le candidat, puis le candidat complète sa fiche.
          </span>
        </div>
      </div>

      {message && (
        <p className={message.classe} role={message.classe === 'erreur' ? 'alert' : 'status'}>
          {message.texte}
        </p>
      )}

      {!moi?.loge ? (
        <section className="bloc">
          <p className="aide" style={{ margin: 0 }}>
            Votre compte n’est rattaché à aucune loge. Une personne de l’administration doit faire
            le lien avant que vous puissiez ouvrir un dossier : le candidat rejoindra la loge de
            celui qui l’invite.
          </p>
        </section>
      ) : (
        <>
          <section className="bloc">
            <h2>Inviter un parrain</h2>
            <p className="aide" style={{ margin: '0 0 0.9rem' }}>
              Le parrain reçoit un lien, valable trente jours, pour présenter le candidat. Le dossier
              s’ouvrira à la loge {moi.loge}, avec le numéro suivant, sans référent : il apparaîtra
              dans les nouvelles demandes.
            </p>
            {!courrielConfigure() && (
              <p className="aide" style={{ margin: '0 0 0.9rem' }}>
                L’envoi automatique n’est pas configuré sur ce serveur : le lien s’affichera ici, et
                vous le transmettrez vous-même.
              </p>
            )}
            <InviterParrain />
          </section>

          <Parrainages />
        </>
      )}
    </main>
  );
}

/** Où en est chaque invitation de la loge. */
async function Parrainages() {
  const lignes = await listerParrainages();

  if (lignes.length === 0) {
    return (
      <p className="aide">Aucune invitation pour l’instant. Elles apparaîtront ici, avec leur état.</p>
    );
  }

  return (
    <div className="tableau-enveloppe">
      <table>
        <thead>
          <tr>
            <th scope="col">Parrain</th>
            <th scope="col">Invité par</th>
            <th scope="col">Le</th>
            <th scope="col">État</th>
            <th scope="col">Candidat</th>
            <th scope="col">
              <span className="visuellement-cache">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.id}>
              <td>
                <strong>{ligne.parrain_nom ?? ligne.parrain_email ?? 'Sans parrain'}</strong>
                {ligne.parrain_nom && <span className="maigre"> · {ligne.parrain_email}</span>}
              </td>
              <td className="maigre">{ligne.envoye_par_nom ?? '—'}</td>
              <td className="maigre" title={dateEnLettres(ligne.cree_le) ?? undefined}>
                {depuis(ligne.cree_le) ?? '—'}
                {ligne.relance_le ? ' · relancé' : ''}
              </td>
              <td>
                <span className={`etat etat--${CLASSE_D_ETAT[ligne.etat]}`}>{ETATS[ligne.etat]}</span>
              </td>
              <td>
                {ligne.candidat_id ? (
                  <Link href={`/espace/candidats?fiche=${ligne.candidat_id}&vue=loge`}>
                    {ligne.candidat_nom ?? 'Sans nom'}
                  </Link>
                ) : (
                  <span className="maigre">—</span>
                )}
              </td>
              <td>
                {/* Le candidat n'a pas reçu son lien, ou l'a laissé expirer : on
                    lui en envoie un nouveau. Tant qu'il n'a pas répondu. */}
                {ligne.candidat_id && !ligne.candidature_completee_le && ligne.etat !== 'revoque' && (
                  <BoutonRenvoyer candidat={ligne.candidat_id} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
