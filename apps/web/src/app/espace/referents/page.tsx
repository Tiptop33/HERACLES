import Link from 'next/link';
import {
  TOUTES_LES_LOGES,
  choisirLoge,
  filtrerAnnuaire,
  filtrerParLoge,
  listerAnnuaire,
  logesDeLAnnuaire,
  resumeDeLAnnuaire,
} from '@/lib/annuaire';
import { initiales, nomComplet, telephone } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { DrapeauFrance } from './DrapeauFrance';
import { Corbeille, Stylo } from '@/components/Icones';

export const metadata = { title: 'Référents — HERACLES' };

/** Le premier des paramètres d'adresse, quand il y en a plusieurs. */
function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

/** Ce que la route de suppression renvoie, dit à qui a cliqué. */
const REFUS: Record<string, string> = {
  droit: 'Seul un administrateur peut retirer une fiche.',
  absente: 'Cette fiche n’existe plus.',
  candidats: 'Cette fiche accompagne encore des candidats. Confiez-les à quelqu’un d’abord.',
  soi: 'On ne retire pas sa propre fiche.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'La fiche n’a pas pu être retirée.',
};

export default async function Referents({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    loge?: string | string[];
    supprimer?: string | string[];
    erreur?: string | string[];
  }>;
}) {
  const profil = await exigerProfil();
  const parametres = await searchParams;
  const recherche = premier(parametres.q);

  // Ce que la base rend dépend de qui appelle : sa loge pour un référent,
  // toutes pour un administrateur (migration 0012). Le contrôle d'accès est
  // là, et pas ici.
  const tous = await listerAnnuaire();

  // Le filtre de cette page-ci ne protège rien — il range. La page s'ouvre sur
  // la loge de la personne connectée : un référent n'en a qu'une, un
  // administrateur en a plusieurs mais travaille dans une seule.
  const loges = logesDeLAnnuaire(tous);
  const loge = choisirLoge(tous, premier(parametres.loge));
  const deLaLoge = filtrerParLoge(tous, loge);
  const fiches = filtrerAnnuaire(deLaLoge, recherche);

  const admin = profil.role === 'admin';
  const nomDeLaLoge = loges.find((l) => l.valeur === loge)?.nom ?? '';
  // Une seule loge et personne d'orphelin : il n'y a rien à choisir.
  const choixOuvert = loges.length > 1;

  const refus = REFUS[premier(parametres.erreur)] ?? null;

  /** L'adresse de cette même page, avec un paramètre en plus ou en moins. */
  const adresse = (ajout?: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (recherche) p.set('q', recherche);
    if (premier(parametres.loge)) p.set('loge', premier(parametres.loge));
    for (const [cle, valeur] of Object.entries(ajout ?? {})) {
      if (valeur === null) p.delete(cle);
      else p.set(cle, valeur);
    }
    const suite = p.toString();
    return suite ? `/espace/referents?${suite}` : '/espace/referents';
  };

  // La fenêtre de confirmation est rendue par le serveur, sur la seule foi de
  // l'adresse. Elle s'ouvre donc sans une ligne de script, se met en favori,
  // et le bouton « retour » du navigateur la referme.
  const aRetirer = admin ? (fiches.find((f) => f.id === premier(parametres.supprimer)) ?? null) : null;

  return (
    <main className="corps">
      <div className="entete-liste">
        <div>
          <h1>Référents</h1>
          <span className="compte">
            {[nomDeLaLoge, resumeDeLAnnuaire(deLaLoge)].filter(Boolean).join(' · ')}
          </span>
        </div>

        {/* Un formulaire en `get`, sans une ligne de script : le choix de la
            loge part avec la recherche, et l'adresse obtenue se met en
            favori ou s'envoie à un collègue. */}
        <form className="filtres" method="get" action="/espace/referents">
          {choixOuvert && (
            <>
              <select
                className="filtre-loge"
                name="loge"
                defaultValue={loge}
                aria-label="Choisir une loge"
              >
                <option value={TOUTES_LES_LOGES}>Toutes les loges</option>
                {loges.map((l) => (
                  <option key={l.valeur} value={l.valeur}>
                    {l.nom}
                  </option>
                ))}
              </select>
              <button className="filtre" type="submit">
                Afficher
              </button>
            </>
          )}

          <input
            className="recherche"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Chercher un nom, une loge…"
            aria-label="Chercher un référent"
          />
        </form>
      </div>

      {refus && (
        <p className="erreur" role="alert">
          {refus}
        </p>
      )}

      {tous.length === 0 && (
        <p className="vide-liste">
          Votre compte n&apos;est rattaché à aucune loge. Une personne de l&apos;administration
          doit faire le lien avant que vos collègues apparaissent ici.
        </p>
      )}

      {tous.length > 0 && deLaLoge.length === 0 && (
        <p className="vide-liste">Personne dans cette loge.</p>
      )}

      {deLaLoge.length > 0 && fiches.length === 0 && (
        <p className="vide-liste">Personne ne correspond à cette recherche.</p>
      )}

      {fiches.length > 0 && (
        <div className="annuaire">
          {fiches.map((f) => {
            const nom = nomComplet(f.prenom, f.nom) || 'Sans nom';
            const tel = telephone(f.telephone);

            return (
              <article key={f.id} className="fiche-annuaire">
                <div className="fiche-annuaire-tete">
                  {/* La photo rapatriée de Bubble, servie sous contrôle
                      d'accès. `alt` vide : le nom est juste en dessous, et
                      l'annoncer deux fois n'aide personne. Faute de photo,
                      les initiales. */}
                  {f.a_une_photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="portrait"
                      src={`/espace/referents/${f.id}/photo`}
                      alt=""
                      width={67}
                      height={67}
                      loading="lazy"
                    />
                  ) : (
                    <span className="initiales" aria-hidden="true">
                      {initiales(f.prenom, f.nom)}
                    </span>
                  )}

                  {/* Le nombre que porte la carte de votre maquette : les
                      candidats que cette personne accompagne aujourd'hui,
                      référent ou parrain, dossiers clôturés exclus. */}
                  {f.candidats_suivis > 0 && (
                    <span
                      className="compte-suivis"
                      title={`${f.candidats_suivis} candidat${f.candidats_suivis > 1 ? 's' : ''} accompagné${f.candidats_suivis > 1 ? 's' : ''}`}
                    >
                      {f.candidats_suivis}
                    </span>
                  )}

                  {admin && (
                    <span className="gestes">
                      <Link
                        href={`/espace/referents/${f.id}/modifier`}
                        className="geste geste--corriger"
                        aria-label={`Corriger la fiche de ${nom}`}
                        title="Corriger cette fiche"
                      >
                        <Stylo />
                      </Link>
                      <Link
                        href={adresse({ supprimer: f.id })}
                        className="geste geste--retirer"
                        aria-label={`Retirer la fiche de ${nom}`}
                        title="Retirer cette fiche"
                      >
                        <Corbeille />
                      </Link>
                    </span>
                  )}
                </div>

                <p className="fiche-annuaire-nom">
                  <strong>{f.nom ?? ''}</strong> {f.prenom ?? ''}
                </p>

                {tel ? (
                  <p className="maigre ligne-telephone">
                    {/* Le drapeau ne s'affiche que sur un numéro reconnu comme
                        français. Un numéro étranger le porterait à tort. */}
                    {tel.francais && <DrapeauFrance />}
                    <a href={`tel:${tel.lien}`}>{tel.affiche}</a>
                  </p>
                ) : (
                  <p className="maigre">téléphone non renseigné</p>
                )}

                {f.email && (
                  <p className="maigre">
                    <a href={`mailto:${f.email}`}>{f.email}</a>
                  </p>
                )}

                <p className="fiche-annuaire-pied">
                  <span className="maigre">
                    {[f.loge_nom, f.college].filter(Boolean).join(' · ') || '—'}
                  </span>
                  {/* Dire laquelle est la vôtre : c'est de cette fiche que la
                      page tire la loge sur laquelle elle s'ouvre. */}
                  {f.c_est_moi && <span className="etat etat--suivi">vous</span>}
                  {/* Une fiche reprise de Bubble n'a pas forcément de compte :
                      la personne existe dans l'annuaire mais ne peut pas encore
                      se connecter. C'est ce qui reste à faire avant la
                      bascule, et le dire ici évite d'avoir à le chercher. */}
                  {!f.compte_rattache && <span className="etat etat--attente">sans compte</span>}
                </p>
              </article>
            );
          })}
        </div>
      )}

      {aRetirer && <FenetreDeRetrait fiche={aRetirer} fermer={adresse({ supprimer: null })} />}
    </main>
  );
}

/**
 * La fenêtre de confirmation. Amovible de trois façons : le lien « Annuler »,
 * un clic à côté — le fond est lui-même un lien —, et le bouton « retour » du
 * navigateur, puisque son ouverture n'est qu'une adresse.
 *
 * Quand la fiche accompagne des candidats, il n'y a pas de bouton rouge du
 * tout : la base refuserait, et un bouton qui échoue toujours vaut moins
 * qu'une phrase qui explique.
 */
function FenetreDeRetrait({
  fiche,
  fermer,
}: {
  fiche: { id: string; nom: string | null; prenom: string | null; loge_nom: string | null; compte_rattache: boolean; candidats_suivis: number };
  fermer: string;
}) {
  const nom = nomComplet(fiche.prenom, fiche.nom) || 'cette personne';
  const accompagne = fiche.candidats_suivis > 0;

  return (
    <div className="fenetre-fond">
      <Link href={fermer} className="fenetre-voile" aria-label="Fermer sans rien retirer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="retrait-titre">
        <h2 id="retrait-titre">Retirer {nom} de l’annuaire&nbsp;?</h2>

        {accompagne ? (
          <>
            <p>
              Impossible pour l’instant&nbsp;: cette fiche accompagne{' '}
              <strong>
                {fiche.candidats_suivis} candidat{fiche.candidats_suivis > 1 ? 's' : ''}
              </strong>
              . Les retirer d’un coup les laisserait sans référent, sans que personne ne
              le voie.
            </p>
            <p className="aide">Confiez-les à quelqu’un d’autre, puis revenez ici.</p>
          </>
        ) : (
          <>
            <p>
              La fiche disparaîtra de l’annuaire{fiche.loge_nom ? ` de ${fiche.loge_nom}` : ''}.
              Cela ne se défait pas.
            </p>
            {fiche.compte_rattache && (
              <p className="aide">
                Son compte HERACLES, lui, subsistera&nbsp;: cette personne pourra encore se
                connecter, mais n’aura plus ni loge ni collègues.
              </p>
            )}
          </>
        )}

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton">
            {accompagne ? 'Fermer' : 'Annuler'}
          </Link>

          {!accompagne && (
            <form method="post" action={`/api/referents/${fiche.id}/supprimer`}>
              <button className="bouton bouton--danger" type="submit">
                Retirer la fiche
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
