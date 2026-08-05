import Link from 'next/link';
import FormulaireConnexion from './FormulaireConnexion';

export const metadata = { title: 'Se connecter — HERACLES' };

/**
 * Les codes que la route de connexion renvoie quand le formulaire est parti
 * sans JavaScript. Chacun sait sous quel champ il doit s'afficher : une erreur
 * se lit là où elle se corrige.
 */
const ERREURS = {
  identifiants: { champ: 'motDePasse' as const, message: 'Adresse e-mail ou mot de passe incorrect.' },
  formulaire: { champ: 'email' as const, message: 'Renseignez votre adresse e-mail et votre mot de passe.' },
  lien: {
    champ: null,
    message: "Ce lien de confirmation n'est plus valable. Connectez-vous, ou demandez un nouvel email.",
  },
};

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>;
}) {
  const { suite, erreur } = await searchParams;
  const initiale = erreur && erreur in ERREURS ? ERREURS[erreur as keyof typeof ERREURS] : null;

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <span className="entree-logo" aria-hidden="true">
            H
          </span>
          <h1>HERACLES</h1>
        </div>

        <FormulaireConnexion suite={suite} erreurInitiale={initiale} />

        <p className="entree-pied">
          Pas encore de compte ? <Link href="/inscription">En créer un</Link>
        </p>
      </div>
    </main>
  );
}
