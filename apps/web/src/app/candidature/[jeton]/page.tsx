import Logo from '@/components/Logo';
import { lireCandidature } from '@/lib/parrainage-serveur';
import FormulaireCandidature from './FormulaireCandidature';

export const metadata = { title: 'Votre fiche — HERACLES' };

/**
 * La page du candidat : `renseignement_candidat` chez Bubble, sans compte.
 *
 * Le jeton de l'adresse est le seul droit. Elle s'ouvre pré-remplie de ce que
 * le parrain a dit — nom, prénom, adresse, type de recherche —, que le
 * candidat peut corriger.
 */

const MOTIFS: Record<string, string> = {
  deja_completee: 'Votre fiche a déjà été envoyée. Merci ! La commission reviendra vers vous.',
  revoque: 'Ce lien n’est plus valable. Contactez la personne qui vous a présenté.',
  expire:
    'Ce lien a expiré. Demandez-en un nouveau à la personne qui vous a présenté : la commission vous le renverra.',
};

const ERREURS: Record<string, string> = {
  saisie: 'Un champ est incomplet. Vérifiez le formulaire.',
  cv: 'Joignez votre CV.',
  taille: 'Un fichier dépasse 10 Mo.',
  format: 'Un fichier n’est pas reconnu : PDF, Word, OpenDocument, RTF, JPEG, PNG ou WebP.',
  echec: 'L’envoi a échoué. Réessayez dans un instant.',
};

export default async function PageDuCandidat({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { jeton } = await params;
  const { erreur } = await searchParams;
  const candidature = await lireCandidature(jeton);

  if (!candidature || !candidature.valable) {
    return (
      <main className="entree">
        <div className="entree-carte">
          <div className="entree-marque">
            <Logo />
          </div>
          <h1 className="entree-titre">Ce lien n’est plus valable</h1>
          <p className="entree-chapo">
            {(candidature?.motif && MOTIFS[candidature.motif]) ??
              'Ce lien ne correspond à aucune fiche en attente. Vérifiez qu’il est complet.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="entree">
      <div className="entree-carte entree-carte--large">
        <div className="entree-marque">
          <Logo />
        </div>

        <h1 className="entree-titre">Votre fiche</h1>
        <p className="entree-chapo">
          Bonjour{candidature.prenom ? ` ${candidature.prenom}` : ''}. Pour que la commission
          {candidature.loge_nom ? (
            <>
              {' '}
              de la loge <strong>{candidature.loge_nom}</strong>
            </>
          ) : null}{' '}
          puisse vous accompagner, décrivez votre parcours et ce que vous cherchez, et joignez votre
          CV. Les champs marqués d’un astérisque sont obligatoires.
        </p>

        {erreur && ERREURS[erreur] && (
          <p className="erreur" role="alert">
            {ERREURS[erreur]}
          </p>
        )}

        <FormulaireCandidature
          jeton={jeton}
          initial={{
            prenom: candidature.prenom ?? '',
            nom: candidature.nom ?? '',
            email: candidature.email ?? '',
            type_emploi: candidature.type_emploi ?? '',
          }}
          // Lu à chaque affichage : la clé se pose ou se retire sans reconstruire.
          lectureDisponible={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </div>
    </main>
  );
}
