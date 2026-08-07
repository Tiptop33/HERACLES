import Link from 'next/link';
import { filtrerAnnuaire, listerAnnuaire, resumeDeLAnnuaire } from '@/lib/annuaire';
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
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  const recherche = premier((await searchParams).q);

  // Ce que la base rend dépend de qui appelle : sa loge pour un référent,
  // toutes pour un administrateur (migration 0012). Rien n'est filtré ici.
  const tous = await listerAnnuaire();
  const fiches = filtrerAnnuaire(tous, recherche);
  const admin = profil.role === 'admin';

  return (
    <main className="corps">
      <div className="entete-liste">
        <div>
          <h1>Référents</h1>
          <span className="compte">{resumeDeLAnnuaire(tous)}</span>
        </div>

        <form className="filtres" method="get" action="/espace/referents">
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

      {tous.length > 0 && fiches.length === 0 && (
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
