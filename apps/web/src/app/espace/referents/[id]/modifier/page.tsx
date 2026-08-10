import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { listerLoges } from '@/lib/administration';
import { lireFicheAnnuaire } from '@/lib/annuaire';
import { choixDeCollege } from '@/lib/college';
import { nomsDuCollege } from '@/lib/college-serveur';
import { initiales, nomComplet } from '@/lib/format';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import FormulaireReferent from './FormulaireReferent';
import PhotoDuReferent from './PhotoDuReferent';

export const metadata = { title: 'Modifier un référent — HERACLES' };

/**
 * Les codes que la route renvoie quand le formulaire est parti sans
 * JavaScript. Sans cette table, une correction refusée réafficherait la page
 * sans dire pourquoi.
 */
const ERREURS: Record<string, string> = {
  formulaire: 'Un champ n’a pas été accepté. Vérifiez l’adresse e-mail.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  refus: 'Cette fiche n’est pas modifiable.',
  echec: 'L’enregistrement a échoué. Réessayez.',
  inconnu: 'Fiche inconnue.',
  indisponible: 'Le service est momentanément indisponible.',
  'photo-absente': 'Choisissez une image à déposer.',
  'photo-format': 'Ce fichier n’est pas une image reconnue : JPEG, PNG, WebP, GIF ou AVIF.',
  'photo-taille': 'Cette image dépasse 5 Mo.',
  'photo-echec': 'Le dépôt de l’image a échoué. Réessayez.',
};

export default async function ModifierReferent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; maj?: string; photo?: string }>;
}) {
  const profil = await exigerProfil();
  // Deux fois, et ce n'est pas un oubli : ici pour répondre proprement, et dans
  // la base qui refuse quoi qu'il arrive (policy `referent_modification_admin`).
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));

  const { id } = await params;
  const { erreur, maj, photo } = await searchParams;

  /**
   * Le grain qui force le navigateur à redemander la photo.
   *
   * La photo est servie avec `max-age=300` : sans lui, celle qu'on vient de
   * déposer resterait invisible cinq minutes sur l'écran même où on l'a
   * déposée. Il n'est posé que par le dépôt — une visite ordinaire garde le
   * cache, qui a sa raison d'être.
   *
   * Des chiffres, et rien d'autre : ce paramètre vient de l'adresse, donc de
   * n'importe qui, et il finit dans un attribut `src`.
   */
  const grain = maj && /^\d{1,14}$/.test(maj) ? `?maj=${maj}` : '';

  const [fiche, loges, titres] = await Promise.all([
    lireFicheAnnuaire(id),
    listerLoges(),
    nomsDuCollege(),
  ]);
  if (!fiche) notFound();

  const message = erreur && erreur in ERREURS ? ERREURS[erreur] : null;
  const nom = nomComplet(fiche.prenom, fiche.nom) || 'Sans nom';

  return (
    <main className="corps corps--etroit">
      <div className="entete-liste">
        {/* Le même visage, à la même taille que sur la carte : on doit
            reconnaître au premier coup d'œil la fiche sur laquelle on est en
            train d'écrire. */}
        <div className="entete-portrait">
          {fiche.a_une_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="portrait"
              /* `maj` ne dit rien au serveur : la route ne lit que
                 l'identifiant. Il ne parle qu'au navigateur. */
              src={`/espace/referents/${fiche.id}/photo${grain}`}
              alt=""
              width={67}
              height={67}
            />
          ) : (
            <span className="initiales" aria-hidden="true">
              {initiales(fiche.prenom, fiche.nom)}
            </span>
          )}

          <div>
            <h1>{nom}</h1>
            <span className="compte">
              {fiche.compte_rattache
                ? 'compte rattaché'
                : 'aucun compte — cette personne ne peut pas encore se connecter'}
            </span>
          </div>
        </div>

        <Link href="/espace/referents" className="lien-nu">
          ← Retour à l&apos;annuaire
        </Link>
      </div>

      <FormulaireReferent
        fiche={fiche}
        loges={loges}
        colleges={choixDeCollege(titres, fiche.college)}
        erreurInitiale={message ? { champ: null, message } : null}
      />

      <PhotoDuReferent id={fiche.id} aUnePhoto={fiche.a_une_photo} />

      {!fiche.compte_rattache && (
        <section className="bloc">
          <h2>Donner l&apos;accès</h2>
          <p className="aide" style={{ margin: '0 0 0.9rem' }}>
            L&apos;écran de Bubble proposait ici un champ « mot de passe ». HERACLES ne permet
            nulle part de choisir celui d&apos;un autre : on envoie une invitation, et la personne
            choisit le sien. Le lien vaut sept jours et ne sert qu&apos;une fois.
          </p>
          <Link href="/espace/admin" className="bouton">
            Inviter {fiche.email ? fiche.email : 'cette personne'}
          </Link>
        </section>
      )}

      {/* La fenêtre est rendue par le serveur, sur la seule foi de l'adresse :
          elle s'ouvre sans une ligne de script, et le bouton « retour » du
          navigateur la referme. Elle ne s'ouvre pas sur une fiche sans photo —
          il n'y aurait rien à retirer. */}
      {photo === 'retirer' && fiche.a_une_photo && (
        <FenetreDeRetraitDePhoto id={fiche.id} nom={nom} />
      )}
    </main>
  );
}

/**
 * La fenêtre de confirmation avant de retirer une photo.
 *
 * Elle dit **ce qu'on perd**, plutôt que « êtes-vous sûr ? » — une question à
 * laquelle on répond oui sans lire. Et ce qu'on perd est réel : le fichier
 * quitte le stockage, et l'adresse d'origine chez Bubble part avec lui, sans
 * quoi la prochaine reprise remettrait le visage en place (migration 0049).
 */
function FenetreDeRetraitDePhoto({ id, nom }: { id: string; nom: string }) {
  const fermer = `/espace/referents/${id}/modifier`;

  return (
    <div className="fenetre-fond">
      <Link href={fermer} className="fenetre-voile" aria-label="Fermer sans rien retirer" />

      <div className="fenetre" role="dialog" aria-modal="true" aria-labelledby="retrait-photo">
        <h2 id="retrait-photo">Retirer la photo de {nom}&nbsp;?</h2>

        <p>
          Le fichier <strong>quittera le stockage</strong>, et la fiche n’aura plus de
          visage — dans l’annuaire, sur la feuille d’appel et dans la colonne de gauche.
        </p>

        <p className="aide">
          Rien ne défait ce geste. Si la photo venait de Bubble, son adresse d’origine est
          effacée elle aussi : sans cela, la prochaine reprise la remettrait en place. Pour
          changer de portrait sans le perdre, fermez cette fenêtre et déposez-en un autre.
        </p>

        <div className="fenetre-gestes">
          <Link href={fermer} className="bouton">
            Annuler
          </Link>
          <form method="post" action={`/api/referents/${id}/photo`} encType="multipart/form-data">
            <input type="hidden" name="geste" value="retirer" />
            <button className="bouton bouton--danger" type="submit">
              Retirer la photo
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
