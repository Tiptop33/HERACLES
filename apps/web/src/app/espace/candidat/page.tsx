import Link from 'next/link';
import { redirect } from 'next/navigation';
import EnTete from '@/components/EnTete';
import { premierEcran, type MaFiche } from '@/lib/espace-candidat';
import { lireMaFiche } from '@/lib/espace-candidat-serveur';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import DepotDuDocument from './DepotDuDocument';
import FormulaireMaFiche from './FormulaireMaFiche';

export const metadata = { title: 'Mon espace — HERACLES' };

/**
 * L'espace du candidat (docs/specs/2026-11-07-espace-candidat.md, § 4.3).
 *
 * Tant qu'il n'a rien déposé, une seule chose lui est demandée : son CV. Une
 * fois le CV là — ou s'il choisit de s'en passer —, sa fiche, qu'il peut
 * modifier autant qu'il veut. Le choix « sans CV » tient dans l'adresse.
 */
export default async function EspaceCandidat({
  searchParams,
}: {
  searchParams: Promise<{ 'sans-cv'?: string | string[] }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'candidat') redirect(accueilDuRole(profil.role));

  const fiche = await lireMaFiche();
  const parametres = await searchParams;
  const sansCv = parametres['sans-cv'] === '1';

  return (
    <div className="enveloppe">
      <EnTete profil={profil} />

      <h1>Bonjour {fiche?.prenom ?? profil.prenom ?? ''}</h1>

      {!fiche ? (
        // Un compte candidat sans dossier : invité par l'écran d'invitation
        // générique, sans passer par « Nouveau candidat ». Rien à remplir.
        <p className="discret">
          Votre compte est créé, mais aucun dossier ne lui est encore rattaché. La commission vous
          recontactera.
        </p>
      ) : premierEcran(fiche, sansCv) === 'cv' ? (
        <section className="carte espace-candidat-cv">
          <h2>Pour commencer, votre CV</h2>
          <p className="discret">
            Déposez votre CV au format PDF. Vous compléterez ensuite votre fiche : elle sert à la
            commission pour vous accompagner dans votre recherche.
          </p>
          <DepotDuDocument genre="cv" present={false} principal />
          <p className="aide">
            Pas de CV sous la main ?{' '}
            <Link href="/espace/candidat?sans-cv=1">Remplir ma fiche sans CV</Link>
          </p>
        </section>
      ) : (
        <>
          <p className="discret">
            {fiche.candidature_completee_le
              ? 'Voici votre fiche. Vous pouvez la modifier quand vous le souhaitez.'
              : 'Complétez votre fiche, puis enregistrez-la. Vous pourrez la modifier ensuite.'}
          </p>

          <section className="carte espace-candidat-documents">
            <h2>Vos documents</h2>
            <DepotDuDocument genre="cv" present={fiche.a_un_cv} />
            <DepotDuDocument genre="lettre" present={fiche.a_une_lettre} />
            <p className="aide">10 Mo au plus par fichier.</p>
          </section>

          <FormulaireMaFiche
            initial={valeursDeLaFiche(fiche)}
            email={fiche.email ?? ''}
            premierEnvoi={!fiche.candidature_completee_le}
          />
        </>
      )}
    </div>
  );
}

/** Les réponses de la fiche, sans ce qui n'est pas un champ à remplir. */
function valeursDeLaFiche(fiche: MaFiche) {
  return Object.fromEntries(
    Object.entries(fiche).filter(([, valeur]) => typeof valeur !== 'boolean'),
  ) as Record<string, string | number | null>;
}
