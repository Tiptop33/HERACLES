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
import { initiales, nomComplet } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';

export const metadata = { title: 'Référents — HERACLES' };

/** Le premier des paramètres d'adresse, quand il y en a plusieurs. */
function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

export default async function Referents({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; loge?: string | string[] }>;
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

            return (
              <article key={f.id} className="fiche-annuaire">
                <div className="fiche-annuaire-tete">
                  <span className="initiales" aria-hidden="true">
                    {initiales(f.prenom, f.nom)}
                  </span>

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
                    <Link
                      href={`/espace/referents/${f.id}/modifier`}
                      className="lien-nu"
                      aria-label={`Modifier la fiche de ${nom}`}
                    >
                      Modifier
                    </Link>
                  )}
                </div>

                <p className="fiche-annuaire-nom">
                  <strong>{f.nom ?? ''}</strong> {f.prenom ?? ''}
                </p>

                {f.telephone ? (
                  <p className="maigre">
                    <a href={`tel:${f.telephone.replace(/\s/g, '')}`}>{f.telephone}</a>
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
    </main>
  );
}
