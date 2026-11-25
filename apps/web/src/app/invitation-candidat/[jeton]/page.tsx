import Link from 'next/link';
import Logo from '@/components/Logo';
import { empreinte } from '@/lib/invitation';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const metadata = { title: 'Votre espace candidat — HERACLES' };

const REFUS: Record<string, string> = {
  referent:
    'Cette adresse e-mail est déjà celle d’un compte de référent. Demandez à votre référent de mettre une autre adresse sur votre fiche.',
  autre: 'Cette adresse e-mail est déjà reliée à un autre dossier. Parlez-en à votre référent.',
  echec: 'Votre espace n’a pas pu s’ouvrir. Réessayez dans un instant.',
};

/**
 * L'invitation à la page candidat (0105). Le lien est le droit : la page le
 * vérifie avec la clé de service, puis montre un bouton. Rien ne se passe à
 * l'affichage — les messageries qui ouvrent les liens pour les vérifier ne
 * consomment pas l'invitation.
 */
export default async function InvitationCandidat({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ refus?: string }>;
}) {
  const { jeton } = await params;
  const { refus } = await searchParams;

  let prenom: string | null = null;
  let valable = false;
  if (/^[A-Za-z0-9_-]{20,100}$/.test(jeton)) {
    const { data } = await supabaseAdmin().rpc('invitation_a_la_page', { empreinte: empreinte(jeton) });
    const invitation = ((data as { prenom: string | null; valable: boolean }[] | null) ?? [])[0];
    valable = Boolean(invitation?.valable);
    prenom = invitation?.prenom ?? null;
  }

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        {valable ? (
          <>
            <h1 className="entree-titre">Bonjour{prenom ? ` ${prenom}` : ''}</h1>
            <p className="entree-chapo">
              Votre espace candidat est prêt. Vous y tiendrez votre fiche à jour, y déposerez vos CV et
              vos lettres de motivation, y verrez les offres de vos secteurs et direz à votre référent où
              vous en êtes.
            </p>
            {refus && <p className="erreur" role="alert">{REFUS[refus] ?? REFUS.echec}</p>}
            <form action={`/api/invitation-candidat/${jeton}`} method="post">
              <button className="bouton bouton--marque bouton--pleine-largeur" type="submit">
                Ouvrir mon espace
              </button>
            </form>
            <p className="entree-pied" style={{ textAlign: 'left' }}>
              Aucun mot de passe à retenir : à chaque visite, vous recevrez un lien par e-mail.
            </p>
          </>
        ) : (
          <>
            <h1 className="entree-titre">Ce lien ne vaut plus</h1>
            <p className="entree-chapo">
              Il a déjà servi, ou il a plus de trente jours. Si votre espace est ouvert, recevez un lien de
              connexion ; sinon, demandez une nouvelle invitation à votre référent.
            </p>
            <Link href="/connexion/lien" className="bouton bouton--marque bouton--pleine-largeur">
              Recevoir un lien de connexion
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
