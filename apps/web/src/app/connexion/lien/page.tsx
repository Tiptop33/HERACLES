import Link from 'next/link';
import Logo from '@/components/Logo';
import FormulaireLien from './FormulaireLien';

export const metadata = { title: 'Mon espace candidat — HERACLES' };

const ERREURS: Record<string, string> = {
  adresse: 'Cette adresse e-mail ne se lit pas.',
  lien: 'Ce lien ne vaut plus : il a déjà servi, ou il a expiré. Demandez-en un nouveau.',
};

/**
 * L'entrée des candidats (0105) : pas de mot de passe, un lien par courriel.
 * Les référents gardent la connexion par mot de passe, à côté.
 */
export default async function ConnexionParLien({
  searchParams,
}: {
  searchParams: Promise<{ envoye?: string; erreur?: string; deja?: string }>;
}) {
  const { envoye, erreur, deja } = await searchParams;

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        <h1 className="entree-titre">Mon espace candidat</h1>
        <p className="entree-chapo">
          Entrez l’adresse e-mail que vous avez donnée lors de votre candidature. Vous recevrez un
          lien pour ouvrir votre espace, sans mot de passe.
        </p>

        {deja && (
          <p className="encart" role="status">
            Votre espace est déjà ouvert. Recevez un lien de connexion à votre adresse.
          </p>
        )}

        <FormulaireLien erreurInitiale={erreur ? (ERREURS[erreur] ?? null) : null} dejaEnvoye={Boolean(envoye)} />

        <p className="entree-pied" style={{ textAlign: 'left' }}>
          Vous êtes référent&nbsp;? <Link href="/connexion">Connexion avec mot de passe</Link>
        </p>
      </div>
    </main>
  );
}
