import { redirect } from 'next/navigation';
import { etatInvitation, listerInvitations, listerLoges } from '@/lib/administration';
import { dateEnLettres, depuis } from '@/lib/format';
import { libelleRoleInvitation } from '@/lib/invitation';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import FormulaireInvitation from './FormulaireInvitation';

export const metadata = { title: 'Administration — HERACLES' };

export default async function EspaceAdmin() {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));

  // Ces deux lectures ne filtrent rien à la main : la RLS (migration 0010) ne
  // les ouvre qu'aux administrateurs. Sans elle, la page serait vide.
  const [invitations, loges] = await Promise.all([listerInvitations(), listerLoges()]);

  const enAttente = invitations.filter((i) => i.etat === 'envoyee' && !i.perimee).length;
  const acceptees = invitations.filter((i) => i.etat === 'acceptee').length;

  return (
    <>

      <main className="corps">
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

        <section className="bloc">
          <h2>Inviter quelqu&apos;un</h2>
          <p className="aide" style={{ margin: '0 0 0.9rem' }}>
            La personne reçoit un lien valable sept jours. Il ne sert qu&apos;une fois, et ne vaut
            que pour l&apos;adresse à laquelle il part.
          </p>
          <FormulaireInvitation loges={loges} />
        </section>

        {invitations.length > 0 && (
          <div className="tableau-enveloppe">
            <table>
              <thead>
                <tr>
                  <th scope="col">Adresse</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Loge</th>
                  <th scope="col">État</th>
                  <th scope="col">Invitée par</th>
                  <th scope="col">Envoyée</th>
                  <th scope="col">Expire</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const etat = etatInvitation(invitation);
                  return (
                    <tr key={invitation.id}>
                      <td>
                        <strong>{invitation.email}</strong>
                      </td>
                      <td className="maigre">{libelleRoleInvitation(invitation.role)}</td>
                      <td className="maigre">{invitation.loge_nom ?? '—'}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
