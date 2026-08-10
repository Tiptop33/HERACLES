import DepotDePhoto from '@/components/DepotDePhoto';
import EnTete from '@/components/EnTete';
import FenetreDeRetraitDePhoto from '@/components/FenetreDeRetraitDePhoto';
import PortraitDeposable from '@/components/PortraitDeposable';
import { initiales } from '@/lib/format';
import { exigerProfil, lireMaPhoto } from '@/lib/profil';
import { libelleDuRole } from '@/lib/roles';
import FormulaireProfil from './FormulaireProfil';

export const metadata = { title: 'Mon compte — HERACLES' };

/**
 * Les codes que la route de la photo renvoie quand le formulaire est parti
 * sans JavaScript. Sans cette table, un dépôt refusé réafficherait la page
 * sans dire pourquoi.
 */
const ERREURS: Record<string, string> = {
  session: 'Votre session a expiré. Reconnectez-vous.',
  'photo-absente': 'Choisissez une image à déposer.',
  'photo-format': 'Ce fichier n’est pas une image reconnue : JPEG, PNG, WebP, GIF ou AVIF.',
  'photo-taille': 'Cette image dépasse 5 Mo.',
  'photo-sans-fiche': 'Votre compte n’est rattaché à aucune fiche de référent.',
  'photo-echec': 'Le dépôt de l’image a échoué. Réessayez.',
};

export default async function MonCompte({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; maj?: string; photo?: string }>;
}) {
  const [profil, maPhoto] = await Promise.all([exigerProfil(), lireMaPhoto()]);
  const { erreur, maj, photo } = await searchParams;

  const message = erreur && erreur in ERREURS ? ERREURS[erreur] : null;

  /**
   * Le grain qui force le navigateur à redemander la photo.
   *
   * Elle est servie avec `max-age=300` : sans lui, celle qu'on vient de
   * déposer resterait invisible cinq minutes sur l'écran même où on l'a
   * déposée. Il n'est posé que par le dépôt — une visite ordinaire garde le
   * cache, qui a sa raison d'être.
   *
   * Des chiffres, et rien d'autre : ce paramètre vient de l'adresse, donc de
   * n'importe qui, et il finit dans un attribut `src`.
   */
  const grain = maj && /^\d{1,14}$/.test(maj) ? `?maj=${maj}` : '';

  return (
    <div className="enveloppe">
      <EnTete profil={profil} />

      <h1>Mon compte</h1>
      <p className="discret">
        Vous êtes inscrit comme <strong>{libelleDuRole(profil.role)}</strong>. Ce choix ne se
        modifie pas depuis cette page : écrivez-nous s&apos;il faut le changer.
      </p>

      {message && (
        <p className="erreur" role="alert">
          {message}
        </p>
      )}

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        <FormulaireProfil profil={profil} />
      </div>

      {/* Rien pour qui n'a pas de fiche de référent : il n'y aurait aucun
          endroit où accrocher un visage. C'est le cas d'un administrateur qui
          n'est pas lui-même référent. */}
      {maPhoto && (
        <div className="carte" style={{ marginTop: '1rem' }}>
          <div className="mon-portrait">
            <PortraitDeposable
              action="/api/profil/photo"
              retour="/mon-compte"
              src={
                maPhoto.a_une_photo
                  ? `/espace/referents/${maPhoto.referent_id}/photo${grain}`
                  : null
              }
              initiales={initiales(profil.prenom, profil.nom, profil.email)}
            />

            <p className="aide">
              Glissez une photo sur le portrait, ou double-cliquez dedans pour aller la
              chercher sur votre ordinateur. Votre visage s’affiche alors dans l’annuaire de
              votre loge, sur la feuille d’appel des réunions, et sous votre nom dans la
              colonne de gauche. Il ne sort jamais de l’application.
            </p>
          </div>

          <DepotDePhoto
            action="/api/profil/photo"
            retour="/mon-compte"
            aUnePhoto={maPhoto.a_une_photo}
            titre="Ma photo"
          />
        </div>
      )}

      {photo === 'retirer' && maPhoto?.a_une_photo && (
        <FenetreDeRetraitDePhoto
          action="/api/profil/photo"
          retour="/mon-compte"
          titre="Retirer votre photo ?"
          sienne
        />
      )}
    </div>
  );
}
