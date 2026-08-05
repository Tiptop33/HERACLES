import Link from 'next/link';
import Logo from '@/components/Logo';
import { profilCourant } from '@/lib/profil';
import FormulaireNouveauMotDePasse from './FormulaireNouveauMotDePasse';

export const metadata = { title: 'Choisissez un mot de passe — HERACLES' };

export default async function NouveauMotDePasse() {
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
            <FormulaireNouveauMotDePasse />
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
