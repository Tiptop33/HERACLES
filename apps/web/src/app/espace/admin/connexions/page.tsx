import { redirect } from 'next/navigation';
import {
  LIMITE_DES_CONNEXIONS,
  listerLesConnexions,
  listerLesReferentsDuJournal,
  referentDemande,
} from '@/lib/connexions';
import { dateEnLettres, dureeEnClair, heureEnClair, nomComplet } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import FiltreParReferent from './FiltreParReferent';

export const metadata = { title: 'Connexions — HERACLES' };

// Le tableau dit qui est connecté en ce moment : jamais servi d'un cache.
export const dynamic = 'force-dynamic';

/**
 * Les connexions des référents : qui, quel jour, à quelle heure, combien de
 * temps (migration 0110).
 *
 * Réservé aux administrateurs. La redirection ci-dessous évite d'afficher une
 * porte fermée ; le contrôle, lui, est en base — la fonction ne rend rien à
 * qui n'est pas administrateur.
 *
 * `?referent=<id>` restreint le tableau aux connexions d'un référent
 * (migration 0112) ; le menu au-dessus du tableau écrit cette adresse.
 */
export default async function ConnexionsDesReferents({
  searchParams,
}: {
  searchParams: Promise<{ referent?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));

  const referentId = referentDemande((await searchParams).referent);
  const [connexions, referents] = await Promise.all([
    listerLesConnexions(referentId),
    listerLesReferentsDuJournal(),
  ]);
  const enCours = connexions.filter((c) => c.en_cours).length;

  return (
    <main className="corps">
      <div className="entete-liste">
        <div>
          <h1>Connexions</h1>
          <span className="compte">
            {connexions.length === 0
              ? referentId
                ? 'aucune connexion enregistrée pour ce référent'
                : 'aucune connexion enregistrée pour l’instant'
              : `${connexions.length} connexion${connexions.length > 1 ? 's' : ''} · ${enCours} en cours`}
          </span>
        </div>
      </div>

      <p className="aide" style={{ margin: '0 0 0.9rem' }}>
        Une ligne par connexion d&apos;un référent, la plus récente en tête. Une connexion
        s&apos;arrête à la déconnexion, ou au dernier passage devant l&apos;écran ; après trente
        minutes d&apos;absence, le retour en ouvre une nouvelle. L&apos;historique est gardé douze
        mois
        {connexions.length >= LIMITE_DES_CONNEXIONS
          ? ` ; seules les ${LIMITE_DES_CONNEXIONS} dernières connexions sont affichées.`
          : '.'}
      </p>

      {referents.length > 0 && (
        <FiltreParReferent
          choisi={referentId ?? ''}
          referents={referents.map((r) => ({
            id: r.referent_id,
            libelle: r.loge_nom
              ? `${nomComplet(r.prenom, r.nom)} — ${r.loge_nom}`
              : nomComplet(r.prenom, r.nom),
          }))}
        />
      )}

      {connexions.length > 0 && (
        <div className="tableau-enveloppe" data-aide="journal-des-connexions">
          <table>
            <thead>
              <tr>
                <th scope="col">Référent</th>
                <th scope="col">Loge</th>
                <th scope="col">Date</th>
                <th scope="col">Heure</th>
                <th scope="col">Durée</th>
              </tr>
            </thead>
            <tbody>
              {connexions.map((connexion) => (
                <tr key={connexion.id}>
                  <td>{nomComplet(connexion.prenom, connexion.nom)}</td>
                  <td className="maigre">{connexion.loge_nom ?? '—'}</td>
                  <td>{dateEnLettres(connexion.debut) ?? '—'}</td>
                  <td>{heureEnClair(connexion.debut) ?? '—'}</td>
                  <td>
                    {dureeEnClair(connexion.duree_secondes) ?? '—'}
                    {connexion.en_cours && (
                      <>
                        {' '}
                        <span className="etat etat--suivi">en cours</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
