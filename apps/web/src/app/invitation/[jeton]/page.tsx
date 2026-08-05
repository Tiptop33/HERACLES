import Link from 'next/link';
import Logo from '@/components/Logo';
import { libelleRoleInvitation, lireInvitation } from '@/lib/invitation';
import FormulaireInvitation from './FormulaireInvitation';

export const metadata = { title: 'Vous êtes invité·e — HERACLES' };

const MOTIFS: Record<string, string> = {
  deja_acceptee: 'Cette invitation a déjà été acceptée. Connectez-vous avec votre adresse.',
  revoquee: 'Cette invitation a été annulée. Demandez-en une nouvelle à votre administrateur.',
  expiree: 'Cette invitation a expiré. Demandez-en une nouvelle à votre administrateur.',
};

export default async function Invitation({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const invitation = await lireInvitation(jeton);

  if (!invitation || !invitation.valable) {
    return (
      <main className="entree">
        <div className="entree-carte">
          <div className="entree-marque">
            <Logo />
          </div>
          <h1 className="entree-titre">Cette invitation n&apos;est plus valable</h1>
          <p className="entree-chapo">
            {(invitation?.motif && MOTIFS[invitation.motif]) ??
              "Ce lien ne correspond à aucune invitation en cours. Vérifiez qu'il est complet, ou demandez-en un nouveau à votre administrateur."}
          </p>
          <Link href="/connexion" className="bouton bouton--marque bouton--pleine-largeur">
            Aller à la connexion
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        <FormulaireInvitation
          jeton={jeton}
          email={invitation.email}
          loge={invitation.loge_nom}
          role={libelleRoleInvitation(invitation.role)}
          inviteur={invitation.invite_par_nom}
        />
      </div>
    </main>
  );
}
