import { redirect } from 'next/navigation';
import { filtrerComptes, listerComptes, listerLoges } from '@/lib/administration';
import { nomComplet } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import ChoixDuCompte from './ChoixDuCompte';

export const metadata = { title: 'Comptes — HERACLES' };

/** Le premier des paramètres d'adresse, quand il y en a plusieurs. */
function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

/**
 * Admin › Comptes : le rôle et la loge de chaque compte ouvert, y compris ceux
 * qui ne sont pas entrés par le tableau des invitations.
 *
 * Les comptes des candidats n'y figurent pas : ils se règlent sur la fiche du
 * candidat. Ceux qui n'ont jamais été ouverts non plus : une invitation en
 * attente crée un compte avant le clic, et il se gère dans les invitations.
 */
export default async function Comptes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));
  const recherche = premier((await searchParams).q);

  // `lister_comptes` ne rend rien à qui n'est pas administrateur (migration
  // 0109) : la vérification ci-dessus range, la base protège.
  const [tous, loges] = await Promise.all([listerComptes(), listerLoges()]);
  const comptes = filtrerComptes(tous, recherche);

  return (
    <main className="corps">
      <div className="entete-liste">
        <div>
          <h1>Comptes</h1>
          <span className="compte">
            {tous.length === 0
              ? 'aucun compte pour l’instant'
              : `${tous.length} compte${tous.length > 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Un formulaire en `get`, sans une ligne de script, comme l'annuaire. */}
        <form className="filtres" method="get" action="/espace/admin/comptes">
          <input
            className="recherche"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Chercher un nom, une adresse…"
            aria-label="Chercher un compte"
          />
        </form>
      </div>

      {comptes.length === 0 ? (
        tous.length > 0 && <p className="aide">Aucun compte ne correspond à « {recherche} ».</p>
      ) : (
        <div className="tableau-enveloppe">
          <table>
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Adresse</th>
                <th scope="col">Rôle</th>
                <th scope="col">Loge</th>
              </tr>
            </thead>
            <tbody>
              {comptes.map((compte) => {
                const nom = nomComplet(compte.prenom, compte.nom) || compte.email || 'ce compte';
                return (
                  <tr key={compte.id}>
                    <td>
                      <strong>{nomComplet(compte.prenom, compte.nom) || '—'}</strong>
                    </td>
                    <td className="maigre">{compte.email ?? '—'}</td>
                    <ChoixDuCompte
                      // La clé suit les valeurs enregistrées : après relecture,
                      // les menus repartent de ce que dit la base.
                      key={`${compte.id}-${compte.role}-${compte.loge_id ?? ''}-${compte.a_une_fiche}`}
                      id={compte.id}
                      nom={nom}
                      role={compte.role}
                      logeId={compte.loge_id}
                      aUneFiche={compte.a_une_fiche}
                      cEstMoi={compte.c_est_moi}
                      loges={loges}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
