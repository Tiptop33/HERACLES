import Link from 'next/link';
import Logo from '@/components/Logo';
import { profilCourant } from '@/lib/profil';
import FormulaireNouveauMotDePasse from './FormulaireNouveauMotDePasse';

export const metadata = { title: 'Choisissez un mot de passe — HERACLES' };

/**
 * Les codes que la route renvoie quand le formulaire est parti sans
 * JavaScript — avant la fin de l'hydratation, cela arrive à tout le monde.
 * Sans cette table, un mot de passe refusé réaffichait le formulaire vide de
 * toute explication, et l'on ne pouvait que deviner ce qui n'allait pas.
 *
 * Chacun sait sous quel champ s'afficher : une erreur se lit là où elle se
 * corrige.
 */
const ERREURS = {
  formulaire: { champ: 'motDePasse' as const, message: 'Renseignez les deux champs.' },
  regles: {
    champ: 'motDePasse' as const,
    message: 'Le mot de passe ne suit pas les règles ci-dessous.',
  },
  confirmation: {
    champ: 'confirmation' as const,
    message: 'Les deux mots de passe diffèrent.',
  },
  reutilise: {
    champ: 'motDePasse' as const,
    message: 'Ce mot de passe est l’un des trois derniers que vous avez utilisés.',
  },
  expire: {
    champ: null,
    message: "Ce lien n'est plus valable. Demandez-en un nouveau.",
  },
  echec: { champ: null, message: "L'enregistrement a échoué. Réessayez." },
  indisponible: {
    champ: null,
    message: 'Le service est momentanément indisponible. Réessayez dans un instant.',
  },
};

export default async function NouveauMotDePasse({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;
  const initiale = erreur && erreur in ERREURS ? ERREURS[erreur as keyof typeof ERREURS] : null;

  // On n'arrive ici qu'avec la session ouverte par le lien de réinitialisation.
  // Sans elle, le lien a expiré — ou n'a jamais existé.
  const profil = await profilCourant();

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        {profil ? (
          <>
            <h1 className="entree-titre">Choisissez un mot de passe</h1>
            <FormulaireNouveauMotDePasse erreurInitiale={initiale} />
          </>
        ) : (
          <>
            <h1 className="entree-titre">Ce lien n&apos;est plus valable</h1>
            <p className="entree-chapo">
              Un lien de réinitialisation vaut 30 minutes, et ne sert qu&apos;une fois. Demandez-en
              un nouveau : il partira sur la même adresse.
            </p>
            <Link
              href="/mot-de-passe-oublie"
              className="bouton bouton--marque bouton--pleine-largeur"
            >
              Renvoyer un lien
            </Link>
            <p className="entree-pied" style={{ textAlign: 'left' }}>
              <Link href="/connexion">← Retour à la connexion</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
