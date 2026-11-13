import Logo from '@/components/Logo';
import ChoixDesSecteurs from '@/components/ChoixDesSecteurs';
import Ecusson from '@/components/Ecusson';
import { dateEnLettres } from '@/lib/loges-du-reseau';
import { lirePageDuLien } from '@/lib/loges-du-reseau-serveur';

export const metadata = {
  title: 'Les secteurs d’activité de votre loge — HERACLES',
  // L'adresse porte le jeton du Secrétaire : qu'elle ne parte vers aucun autre site.
  referrer: 'no-referrer' as const,
};

/**
 * La page du Secrétaire d'une loge du réseau (maquette validée le 13 novembre
 * 2026, docs/maquettes/loges-du-reseau.html, écrans 1 et 1 bis).
 *
 * Sans compte : le jeton de l'adresse est le seul droit, et la base dit s'il
 * vaut. Le Secrétaire y coche les secteurs d'activité de sa loge ; chaque case
 * s'enregistre aussitôt, il n'y a rien à envoyer. Il peut revenir autant qu'il
 * veut tant que le lien vaut — 90 jours.
 *
 * Un lien inconnu, remplacé ou expiré donne la même page : « Ce lien n'est
 * plus valable ». Elle ne dit pas lequel des trois — de l'extérieur, ils
 * doivent se ressembler.
 */
export default async function PageDuSecretaire({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const page = await lirePageDuLien(jeton);

  if (!page || page.etat !== 'valable') {
    return (
      <main className="entree">
        <div className="entree-carte lien-mort">
          <div className="entree-marque">
            <Logo />
          </div>
          <h1 className="entree-titre">Ce lien n’est plus valable</h1>
          <p className="entree-chapo">
            Il a dépassé ses 90 jours, ou un lien plus récent l’a remplacé. Demandez-en un nouveau à
            l’équipe HERACLES : les secteurs déjà cochés sont conservés.
          </p>
        </div>
      </main>
    );
  }

  const base = `/api/loge-du-reseau/${jeton}`;

  return (
    <main className="entree page-secretaire">
      <div className="entree-carte entree-carte--large">
        <div className="entree-marque">
          <Logo />
        </div>

        <div className="loge-reseau-tete">
          {/* L'écusson de la loge, ou son initiale tant qu'il n'est pas déposé. */}
          <Ecusson src={page.a_un_ecusson ? `/loge-du-reseau/${jeton}/ecusson` : null} nom={page.nom} taille="grand" />
          <div>
            <h1 className="entree-titre">Les secteurs d’activité de votre loge</h1>
            <p className="loge-reseau-titre">
              Loge <strong>{page.nom}</strong>
              {page.numero ? ` · n° ${page.numero}` : ''}
              {page.province ? ` · ${page.province}` : ''}
            </p>
          </div>
        </div>
        <p className="entree-chapo">
          Bonjour{page.secretaire_nom ? ` ${page.secretaire_nom}` : ''}. HERACLES accompagne des
          candidats en recherche d’emploi, d’alternance ou de stage. Pour orienter chacun vers les
          loges qui peuvent l’aider, cochez les secteurs d’activité où travaillent des membres de
          votre loge — <strong>sans nom ni nombre</strong>. Chaque case s’enregistre aussitôt : il
          n’y a rien à envoyer.
        </p>

        <ChoixDesSecteurs
          initiale={page.liste}
          adresses={{
            cocher: `${base}/secteurs`,
            recherche: `${base}/recherche`,
            nomenclature: `${base}/nomenclature`,
          }}
        />

        <p className="lien-validite">
          Ce lien est personnel. Vous pouvez y revenir pour compléter ou corriger la liste
          jusqu’au <strong>{dateEnLettres(page.expire_le)}</strong>.
        </p>
      </div>
    </main>
  );
}
