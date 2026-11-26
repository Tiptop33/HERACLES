import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Corbeille } from '@/components/Icones';
import {
  filtrerComptes,
  listerComptes,
  listerLoges,
  type CompteVisible,
} from '@/lib/administration';
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

/** Ce que la route d'effacement renvoie, dit à qui a cliqué. */
const REFUS: Record<string, string> = {
  droit: 'Seul un administrateur peut effacer un compte.',
  absent: 'Ce compte n’existe plus.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  soi: 'Vous ne pouvez pas effacer votre propre compte.',
  accompagne:
    'Ce compte accompagne encore des candidats : confiez-les à quelqu’un d’autre avant de l’effacer.',
  candidat: 'Le compte d’un candidat ne s’efface pas ici.',
  echec: 'Le compte n’a pas pu être effacé.',
};

/** L'adresse de la liste, recherche gardée, fenêtre d'effacement ouverte ou non. */
function adresseDeLaListe(recherche: string, effacer?: string): string {
  const parametres = new URLSearchParams();
  if (recherche) parametres.set('q', recherche);
  if (effacer) parametres.set('effacer', effacer);
  const suite = parametres.toString();
  return suite ? `/espace/admin/comptes?${suite}` : '/espace/admin/comptes';
}

/**
 * Admin › Comptes : le rôle et la loge de chaque compte ouvert, y compris ceux
 * qui ne sont pas entrés par le tableau des invitations.
 *
 * Les comptes des candidats n'y figurent pas : ils se règlent sur la fiche du
 * candidat. Ceux qui n'ont jamais été ouverts non plus : une invitation en
 * attente crée un compte avant le clic, et il se gère dans les invitations.
 *
 * Chaque compte s'efface par sa corbeille (migration 0113), sauf le sien.
 */
export default async function Comptes({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    effacer?: string | string[];
    erreur?: string | string[];
  }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));
  const parametres = await searchParams;
  const recherche = premier(parametres.q);
  const refus = REFUS[premier(parametres.erreur)] ?? null;

  // `lister_comptes` ne rend rien à qui n'est pas administrateur (migration
  // 0109) : la vérification ci-dessus range, la base protège.
  const [tous, loges] = await Promise.all([listerComptes(), listerLoges()]);
  const comptes = filtrerComptes(tous, recherche);

  // La fenêtre de confirmation est rendue par le serveur, sur la seule foi de
  // l'adresse : elle s'ouvre sans script, et le bouton « retour » la referme.
  const aEffacer =
    tous.find((c) => c.id === premier(parametres.effacer) && !c.c_est_moi) ?? null;

  return (
    <>
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

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

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
                <th scope="col">
                  <span className="visuellement-cache">Effacer</span>
                </th>
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
                    <td>
                      {/* Pas de corbeille sur sa propre ligne : la base le
                          refuserait, et l'on s'enfermerait dehors. */}
                      {!compte.c_est_moi && (
                        <span className="gestes">
                          <Link
                            href={adresseDeLaListe(recherche, compte.id)}
                            className="geste geste--retirer"
                            aria-label={`Effacer le compte de ${nom}`}
                            title="Effacer ce compte"
                            scroll={false}
                          >
                            <Corbeille />
                          </Link>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>

      {aEffacer && <FenetreDEffacement compte={aEffacer} fermer={adresseDeLaListe(recherche)} />}
    </>
  );
}

/**
 * La fenêtre de confirmation, sur le modèle de celle des invitations. Amovible
 * de trois façons : le lien « Annuler », un clic à côté — le fond est lui-même
 * un lien —, et le bouton « retour » du navigateur.
 *
 * Elle dit ce qui part et ce qui reste : le compte ne se rétablit pas, la fiche
 * référent, elle, n'est pas touchée.
 */
function FenetreDEffacement({ compte, fermer }: { compte: CompteVisible; fermer: string }) {
  const nom = nomComplet(compte.prenom, compte.nom) || compte.email || 'ce compte';

  return (
    <div className="fenetre-fond">
      <Link
        href={fermer}
        className="fenetre-voile"
        aria-label="Fermer sans rien effacer"
        scroll={false}
      />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="effacement-titre">
        <h2 id="effacement-titre">Effacer le compte de {nom}&nbsp;?</h2>

        <p>
          {compte.email ? `${compte.email} ne pourra plus se connecter` : 'Cette personne ne pourra plus se connecter'}
          &nbsp;à HERACLES. Cela ne se défait pas&nbsp;: pour revenir, il lui faudra une
          nouvelle invitation.
        </p>
        {compte.a_une_fiche && (
          <p className="aide">
            Sa fiche de référent, elle, reste dans l’annuaire, avec ce qu’elle a signé.
          </p>
        )}

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton" scroll={false}>
            Annuler
          </Link>

          <form method="post" action="/api/comptes/effacer">
            <input type="hidden" name="id" value={compte.id} />
            <button className="bouton bouton--danger" type="submit">
              Effacer le compte
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
