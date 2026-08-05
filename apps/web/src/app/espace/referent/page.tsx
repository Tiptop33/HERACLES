import Link from 'next/link';
import { redirect } from 'next/navigation';
import BarreReferent from '@/components/BarreReferent';
import {
  estFiltre,
  filtrer,
  listerMesCandidats,
  referentCourant,
  resumeDeLaListe,
  type Filtre,
} from '@/lib/candidat';
import { depuis, initiales, nomComplet } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Mes candidats — HERACLES' };

const FILTRES: { valeur: Filtre; libelle: string }[] = [
  { valeur: 'tous', libelle: 'Tous' },
  { valeur: 'recherche', libelle: 'En recherche' },
  { valeur: 'clotures', libelle: 'Clôturés' },
];

type Parametres = { filtre?: string | string[]; q?: string | string[] };

/** Le premier des paramètres d'adresse, quand il y en a plusieurs. */
function premier(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? '';
  return valeur ?? '';
}

export default async function MesCandidats({
  searchParams,
}: {
  searchParams: Promise<Parametres>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'referent') redirect(accueilDuRole(profil.role));

  const parametres = await searchParams;
  const demande = premier(parametres.filtre);
  const filtre: Filtre = estFiltre(demande) ? demande : 'tous';
  const recherche = premier(parametres.q);

  const [referent, tous] = await Promise.all([referentCourant(), listerMesCandidats()]);
  const candidats = filtrer(tous, filtre, recherche);

  const adresse = (valeur: Filtre) => {
    const parametres = new URLSearchParams();
    if (valeur !== 'tous') parametres.set('filtre', valeur);
    if (recherche) parametres.set('q', recherche);
    const suite = parametres.toString();
    return suite ? `/espace/referent?${suite}` : '/espace/referent';
  };

  return (
    <>
      <BarreReferent profil={profil} loge={referent?.loge ?? null} />

      <main className="corps">
        <div className="entete-liste">
          <div>
            <h1>Mes candidats</h1>
            <span className="compte">{resumeDeLaListe(tous)}</span>
          </div>

          <form className="filtres" method="get" action="/espace/referent">
            {FILTRES.map(({ valeur, libelle }) => (
              <Link
                key={valeur}
                href={adresse(valeur)}
                className="filtre"
                aria-current={filtre === valeur}
              >
                {libelle}
              </Link>
            ))}

            {filtre !== 'tous' && <input type="hidden" name="filtre" value={filtre} />}
            <input
              className="recherche"
              type="search"
              name="q"
              defaultValue={recherche}
              placeholder="Chercher un nom, un métier…"
              aria-label="Chercher un candidat"
            />
          </form>
        </div>

        {!referent && (
          <p className="vide-liste">
            Votre compte n&apos;est encore rattaché à aucune fiche de référent. Une personne de
            l&apos;administration doit faire le lien avant que vos candidats apparaissent ici.
          </p>
        )}

        {referent && candidats.length === 0 && (
          <p className="vide-liste">
            {tous.length === 0
              ? 'Aucun candidat ne vous est rattaché pour l’instant.'
              : 'Aucun candidat ne correspond à cette recherche.'}
          </p>
        )}

        {candidats.length > 0 && (
          <div className="tableau-enveloppe">
            <table>
              <thead>
                <tr>
                  <th scope="col">Candidat</th>
                  <th scope="col">N°</th>
                  <th scope="col">Recherche</th>
                  <th scope="col">Secteur visé</th>
                  <th scope="col">Fiche</th>
                  <th scope="col">Suivi</th>
                  <th scope="col">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {candidats.map((candidat) => {
                  const sousTitre = [
                    candidat.age ? `${candidat.age} ans` : null,
                    candidat.ville ?? candidat.adresse,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr key={candidat.id}>
                      <td>
                        <div className="nom-cellule">
                          <span className="initiales" aria-hidden="true">
                            {initiales(candidat.prenom, candidat.nom)}
                          </span>
                          <span>
                            <Link
                              href={`/espace/referent/candidats/${candidat.id}`}
                              className="lien-ligne"
                            >
                              <strong>{nomComplet(candidat.prenom, candidat.nom)}</strong>
                            </Link>
                            {sousTitre && <small>{sousTitre}</small>}
                          </span>
                        </div>
                      </td>
                      <td className="num-candidat">{candidat.numero ?? '—'}</td>
                      <td className="maigre">{candidat.type_emploi ?? '—'}</td>
                      <td className="maigre">{candidat.secteur_activite_libelle ?? '—'}</td>
                      <td>
                        <div className="jauge">
                          <div className="jauge-piste">
                            <div
                              className="jauge-part"
                              style={{ width: `${candidat.remplissage}%` }}
                            />
                          </div>
                          <span>{candidat.remplissage} %</span>
                        </div>
                      </td>
                      <td>
                        <span className={`etat etat--${candidat.suivi.etat}`}>
                          {candidat.suivi.libelle}
                        </span>
                      </td>
                      <td className="maigre">
                        {candidat.suivi.etat === 'attente'
                          ? 'jamais'
                          : (depuis(candidat.maj_le) ?? '—')}
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
