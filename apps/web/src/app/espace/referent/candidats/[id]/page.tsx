import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import BarreReferent from '@/components/BarreReferent';
import BoutonImprimer from '@/components/BoutonImprimer';
import { lireCandidat, referentCourant } from '@/lib/candidat';
import { dateEnLettres, enEtiquettes, initiales, nomComplet } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Fiche candidat — HERACLES' };

/** Une valeur, ou la mention en italique de son absence. */
function Valeur({ children, absent = 'non renseigné' }: { children?: unknown; absent?: string }) {
  const vide =
    children === null ||
    children === undefined ||
    (typeof children === 'string' && children.trim() === '');

  if (vide) return <dd className="vide">{absent}</dd>;
  return <dd>{children as React.ReactNode}</dd>;
}

export default async function FicheCandidat({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfil();
  if (profil.role !== 'referent') redirect(accueilDuRole(profil.role));

  const { id } = await params;

  const [referent, candidat] = await Promise.all([referentCourant(), lireCandidat(id)]);

  // Ni « introuvable », ni « interdit » : la base n'a rien renvoyé, et c'est la
  // seule chose que l'on sait. Distinguer les deux dirait déjà quelque chose.
  if (!candidat) notFound();

  const nom = nomComplet(candidat.prenom, candidat.nom);
  // « Bordeaux (33000) », comme sur la maquette — et la seule ville, ou la seule
  // adresse reprise de Bubble, quand l'autre moitié manque.
  const lieu = candidat.ville ?? candidat.adresse;
  const adresse = [lieu, candidat.code_postal ? `(${candidat.code_postal})` : null]
    .filter(Boolean)
    .join(' ');

  const parcours = [candidat.formations, candidat.experiences]
    .map((bloc) => bloc?.trim())
    .filter(Boolean)
    .join('\n\n');

  const etiquettes = [
    ...enEtiquettes(candidat.competences),
    ...enEtiquettes(candidat.savoir_etre),
    ...enEtiquettes(candidat.informatique),
  ];

  const permis = [candidat.permis_vl, candidat.vehicule].filter(Boolean).join(' · ');

  const documents = [
    { libelle: 'CV', genre: 'cv', chemin: candidat.cv_chemin, url: candidat.cv_url },
    {
      libelle: 'Lettre de motivation',
      genre: 'lettre',
      chemin: candidat.lettre_motivation_chemin,
      url: candidat.lettre_motivation_url,
    },
    {
      libelle: 'CV anonyme',
      genre: 'cv-anonyme',
      chemin: candidat.cv_anonyme_chemin,
      url: candidat.cv_anonyme_url,
    },
  ];

  return (
    <>
      <BarreReferent profil={profil} loge={referent?.loge ?? null} />

      <main className="corps">
        <p className="fil">
          <Link href="/espace/referent">Mes candidats</Link> <span aria-hidden="true">›</span>{' '}
          <span>{nom}</span>
        </p>

        <div className="fiche-entete">
          <span className="portrait" aria-hidden="true">
            {initiales(candidat.prenom, candidat.nom)}
          </span>

          <div>
            <h1>{nom}</h1>
            <div className="sous">
              Fiche n° {candidat.numero ?? '—'}
              {candidat.cree_le && ` · suivie depuis le ${dateEnLettres(candidat.cree_le)}`}
            </div>

            <div className="etiquettes" style={{ marginTop: '0.5rem' }}>
              <span className={`etat etat--${candidat.suivi.etat}`}>{candidat.suivi.libelle}</span>
              {candidat.type_emploi && <span className="etiquette">{candidat.type_emploi}</span>}
              {candidat.secteur_activite_libelle && (
                <span className="etiquette">{candidat.secteur_activite_libelle}</span>
              )}
              {permis && <span className="etiquette">{permis}</span>}
            </div>
          </div>

          <div className="fiche-actions">
            <BoutonImprimer />
            <Link href={`/espace/referent/candidats/${candidat.id}/modifier`} className="bouton bouton--fort">
              Modifier
            </Link>
          </div>
        </div>

        <div className="blocs">
          <section className="bloc">
            <h2>Identité et contact</h2>
            <dl className="champs">
              <dt>Âge</dt>
              <Valeur>{candidat.age ? `${candidat.age} ans` : null}</Valeur>
              <dt>Situation</dt>
              <Valeur>{candidat.situation_familiale}</Valeur>
              <dt>Téléphone</dt>
              <Valeur>
                {candidat.telephone && <a href={`tel:${candidat.telephone}`}>{candidat.telephone}</a>}
              </Valeur>
              <dt>Email</dt>
              <Valeur>
                {candidat.email && <a href={`mailto:${candidat.email}`}>{candidat.email}</a>}
              </Valeur>
              <dt>Adresse</dt>
              <Valeur>{adresse}</Valeur>
            </dl>
          </section>

          <section className="bloc">
            <h2>Sa recherche</h2>
            <dl className="champs">
              <dt>Type</dt>
              <Valeur>{candidat.type_emploi}</Valeur>
              <dt>Métier</dt>
              <Valeur>{candidat.emploi_recherche ?? candidat.metier_libelle}</Valeur>
              <dt>Mobilité</dt>
              <Valeur>{candidat.mobilite_geographique}</Valeur>
              <dt>Disponible</dt>
              <Valeur>{dateEnLettres(candidat.debut_stage)}</Valeur>
              <dt>Secteur</dt>
              <Valeur>{candidat.secteur_activite_libelle}</Valeur>
            </dl>
          </section>

          <section className="bloc">
            <h2>Accompagnement</h2>
            <dl className="champs">
              <dt>Référent</dt>
              <Valeur>{candidat.referent}</Valeur>
              <dt>Parrain</dt>
              <Valeur>{candidat.parrain}</Valeur>
              <dt>Loge</dt>
              <Valeur>{candidat.loge}</Valeur>
              <dt>Appréciation</dt>
              <Valeur>{candidat.appreciation}</Valeur>
              <dt>Clôture</dt>
              <Valeur absent="non clôturé">{candidat.cloture}</Valeur>
            </dl>
          </section>

          <section className="bloc bloc--large">
            <h2>Parcours</h2>
            {parcours ? (
              <p className="prose">{parcours}</p>
            ) : (
              <p className="prose maigre">
                <em>Ni formation ni expérience renseignée pour l&apos;instant.</em>
              </p>
            )}

            {etiquettes.length > 0 && (
              <div className="etiquettes" style={{ marginTop: '0.8rem' }}>
                {etiquettes.map((mot, rang) => (
                  <span className="etiquette" key={`${mot}-${rang}`}>
                    {mot}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="bloc">
            <h2>Documents</h2>
            <div className="fichiers">
              {documents.map(({ libelle, genre, chemin, url }) => {
                if (chemin) {
                  return (
                    <a
                      key={genre}
                      className="fichier"
                      href={`/espace/referent/candidats/${candidat.id}/document/${genre}`}
                    >
                      <span className="type">PDF</span> {libelle}
                    </a>
                  );
                }

                if (url) {
                  return (
                    <div key={genre} className="fichier">
                      <span className="type">PDF</span> {libelle}
                      <span className="poids" title="Pas encore rapatrié depuis Bubble">
                        chez Bubble
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={genre} className="fichier fichier--absent">
                    <span className="type">—</span> {libelle} — non fourni
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bloc">
            <h2>Historique</h2>
            <dl className="champs">
              <dt>Créée le</dt>
              <Valeur>{dateEnLettres(candidat.cree_le)}</Valeur>
              <dt>Modifiée le</dt>
              <Valeur>{dateEnLettres(candidat.maj_le)}</Valeur>
              <dt>Origine</dt>
              <Valeur>{candidat.bubble_id ? 'Reprise Bubble' : 'Saisie dans HERACLES'}</Valeur>
            </dl>
          </section>
        </div>
      </main>
    </>
  );
}
