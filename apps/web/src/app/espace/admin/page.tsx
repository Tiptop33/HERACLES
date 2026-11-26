import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Corbeille } from '@/components/Icones';
import {
  etatInvitation,
  listerInvitations,
  listerLoges,
  type InvitationVisible,
} from '@/lib/administration';
import { dateEnLettres, depuis } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import AdresseDeLInvitation from './AdresseDeLInvitation';
import ChoixDeLInvitation from './ChoixDeLInvitation';
import FormulaireInvitation from './FormulaireInvitation';

export const metadata = { title: 'Administration — HERACLES' };

/** Le premier des paramètres d'adresse, quand il y en a plusieurs. */
function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

/** Ce que la route de suppression renvoie, dit à qui a cliqué. */
const REFUS: Record<string, string> = {
  droit: 'Seul un administrateur peut supprimer une invitation.',
  absente: 'Cette invitation n’existe plus.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'L’invitation n’a pas pu être supprimée.',
};

export default async function EspaceAdmin({
  searchParams,
}: {
  searchParams: Promise<{ supprimer?: string | string[]; erreur?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));
  const parametres = await searchParams;

  // Ces deux lectures ne filtrent rien à la main : la RLS (migration 0010) ne
  // les ouvre qu'aux administrateurs. Sans elle, la page serait vide.
  const [invitations, loges] = await Promise.all([listerInvitations(), listerLoges()]);

  const enAttente = invitations.filter((i) => i.etat === 'envoyee' && !i.perimee).length;
  const acceptees = invitations.filter((i) => i.etat === 'acceptee').length;

  const refus = REFUS[premier(parametres.erreur)] ?? null;

  // La fenêtre de confirmation est rendue par le serveur, sur la seule foi de
  // l'adresse : elle s'ouvre sans script, et le bouton « retour » la referme.
  const aSupprimer = invitations.find((i) => i.id === premier(parametres.supprimer)) ?? null;

  return (
    <>

      {/* Toute la largeur de l'écran, et une seule ligne par invitation : à la
          demande du 26 novembre 2026, pour lire chaque adresse d'un coup d'œil.
          Sur un écran étroit, c'est le tableau qui défile de côté. */}
      <main className="corps corps--large">
        <div className="entete-liste">
          <div>
            <h1>Invitations</h1>
            <span className="compte">
              {invitations.length === 0
                ? 'aucune invitation pour l’instant'
                : `${enAttente} en attente · ${acceptees} acceptée${acceptees > 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {refus && (
          <p className="erreur" role="alert">
            {refus}
          </p>
        )}

        <section className="bloc" data-aide="inviter">
          <h2>Inviter quelqu&apos;un</h2>
          <p className="aide" style={{ margin: '0 0 0.9rem' }}>
            La personne reçoit un lien valable sept jours. Il ne sert qu&apos;une fois, et ne vaut
            que pour l&apos;adresse à laquelle il part.
          </p>
          <FormulaireInvitation loges={loges} />
        </section>

        {invitations.length > 0 && (
          <div className="tableau-enveloppe">
            <table className="tableau-sur-une-ligne">
              <thead>
                <tr>
                  <th scope="col">Adresse</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Loge</th>
                  <th scope="col">État</th>
                  <th scope="col">Invitée par</th>
                  <th scope="col">Envoyée</th>
                  <th scope="col">Expire</th>
                  <th scope="col">
                    <span className="visuellement-cache">Supprimer</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const etat = etatInvitation(invitation);
                  return (
                    <tr key={invitation.id}>
                      <AdresseDeLInvitation
                        // La clé suit l'adresse enregistrée : après relecture,
                        // le champ repart de ce que dit la base.
                        key={`${invitation.id}-${invitation.email}`}
                        id={invitation.id}
                        email={invitation.email}
                        acceptee={invitation.etat === 'acceptee'}
                      />
                      {/* Toutes les lignes se corrigent (migration 0108). Une
                          invitation acceptée corrige le compte lui-même. */}
                      <ChoixDeLInvitation
                        key={`${invitation.id}-${invitation.role}-${invitation.loge_id ?? ''}`}
                        id={invitation.id}
                        email={invitation.email}
                        role={invitation.role}
                        logeId={invitation.loge_id}
                        loges={loges}
                      />
                      <td>
                        <span className={`etat etat--${etat.etat}`}>{etat.libelle}</span>
                      </td>
                      <td className="maigre">{invitation.invite_par_nom ?? '—'}</td>
                      <td className="maigre">{depuis(invitation.cree_le) ?? '—'}</td>
                      <td className="maigre">
                        {invitation.etat === 'envoyee' && !invitation.perimee
                          ? (dateEnLettres(invitation.expire_le) ?? '—')
                          : '—'}
                      </td>
                      <td>
                        <Link
                          href={`/espace/admin?supprimer=${invitation.id}`}
                          className="geste geste--retirer"
                          aria-label={`Supprimer l’invitation de ${invitation.email}`}
                          title="Supprimer cette invitation"
                          scroll={false}
                        >
                          <Corbeille />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {aSupprimer && <FenetreDeSuppression invitation={aSupprimer} />}
    </>
  );
}

/**
 * La fenêtre de confirmation. Amovible de trois façons : le lien « Annuler »,
 * un clic à côté — le fond est lui-même un lien —, et le bouton « retour » du
 * navigateur, puisque son ouverture n'est qu'une adresse.
 *
 * Ce qu'elle dit dépend de l'état : supprimer une invitation en attente rend
 * son lien inutilisable, supprimer une invitation acceptée ne touche pas au
 * compte. Les deux méritent d'être lus avant de cliquer.
 */
function FenetreDeSuppression({ invitation }: { invitation: InvitationVisible }) {
  const fermer = '/espace/admin';
  const enAttente = invitation.etat === 'envoyee' && !invitation.perimee;
  const acceptee = invitation.etat === 'acceptee';

  return (
    <div className="fenetre-fond">
      <Link
        href={fermer}
        className="fenetre-voile"
        aria-label="Fermer sans rien supprimer"
        scroll={false}
      />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="suppression-titre">
        <h2 id="suppression-titre">
          Supprimer l’invitation de {invitation.email}&nbsp;?
        </h2>

        <p>La ligne disparaîtra du tableau des invitations. Cela ne se défait pas.</p>
        {enAttente && (
          <p className="aide">
            Le lien déjà envoyé à cette adresse ne mènera plus à rien.
          </p>
        )}
        {acceptee && (
          <p className="aide">
            Le compte HERACLES de cette personne, lui, reste intact&nbsp;: même rôle, même
            loge, elle pourra toujours se connecter.
          </p>
        )}

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton" scroll={false}>
            Annuler
          </Link>

          <form method="post" action="/api/invitations/supprimer">
            <input type="hidden" name="id" value={invitation.id} />
            <button className="bouton bouton--danger" type="submit">
              Supprimer l’invitation
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
