import Logo from '@/components/Logo';
import { lireParrainage } from '@/lib/parrainage-serveur';
import FormulaireParrain from './FormulaireParrain';

export const metadata = { title: 'Présenter un candidat — HERACLES' };

/**
 * La page du parrain : la page `parrain` de Bubble, sans compte.
 *
 * Le jeton de l'adresse est le seul droit. Un lien servi, remplacé ou expiré
 * le dit, et ne montre rien d'autre — pas même le nom de la loge.
 */

const MOTIFS: Record<string, string> = {
  deja_presente:
    'Vous avez déjà présenté un candidat avec ce lien. Merci ! La commission a reçu votre présentation.',
  revoque: 'Ce lien a été remplacé par un plus récent. Utilisez le dernier courriel reçu.',
  expire: 'Ce lien a expiré. Demandez-en un nouveau à la personne qui vous l’a envoyé.',
};

const ERREURS: Record<string, string> = {
  saisie: 'Un champ est incomplet. Vérifiez le formulaire.',
  echec: 'L’envoi a échoué. Réessayez dans un instant.',
};

export default async function PageDuParrain({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { jeton } = await params;
  const { erreur } = await searchParams;
  const parrainage = await lireParrainage(jeton);

  if (!parrainage || !parrainage.valable) {
    return (
      <main className="entree">
        <div className="entree-carte">
          <div className="entree-marque">
            <Logo />
          </div>
          <h1 className="entree-titre">Ce lien n’est plus valable</h1>
          <p className="entree-chapo">
            {(parrainage?.motif && MOTIFS[parrainage.motif]) ??
              'Ce lien ne correspond à aucune invitation en cours. Vérifiez qu’il est complet.'}
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

        <h1 className="entree-titre">Présenter un candidat</h1>
        <p className="entree-chapo">
          {parrainage.envoye_par_nom ? <strong>{parrainage.envoye_par_nom}</strong> : 'La commission'}
          {parrainage.loge_nom ? (
            <>
              {' '}
              de la loge <strong>{parrainage.loge_nom}</strong>
            </>
          ) : null}{' '}
          vous invite à présenter la personne que vous souhaitez voir accompagnée dans sa recherche
          d’emploi, d’alternance ou de stage. Elle recevra ensuite son propre lien pour compléter
          sa fiche.
        </p>

        {erreur && ERREURS[erreur] && (
          <p className="erreur" role="alert">
            {ERREURS[erreur]}
          </p>
        )}

        <FormulaireParrain jeton={jeton} email={parrainage.parrain_email} />
      </div>
    </main>
  );
}
