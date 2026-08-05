import Link from 'next/link';
import Logo from '@/components/Logo';
import FormulaireOubli from './FormulaireOubli';

export const metadata = { title: 'Réinitialiser l’accès — HERACLES' };

export default async function MotDePasseOublie({
  searchParams,
}: {
  searchParams: Promise<{ envoye?: string; erreur?: string }>;
}) {
  const { envoye, erreur } = await searchParams;

  return (
    <main className="entree">
      <div className="entree-carte">
        <div className="entree-marque">
          <Logo />
        </div>

        <h1 className="entree-titre">Réinitialiser l&apos;accès</h1>
        <p className="entree-chapo">
          Saisissez votre e-mail : un lien valable 30 minutes vous sera envoyé.
        </p>

        <FormulaireOubli erreurInitiale={erreur === 'formulaire'} dejaEnvoye={Boolean(envoye)} />

        <p className="entree-pied" style={{ textAlign: 'left' }}>
          <Link href="/connexion">← Retour à la connexion</Link>
        </p>
      </div>
    </main>
  );
}
