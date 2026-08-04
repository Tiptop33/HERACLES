import Link from 'next/link';
import FormulaireConnexion from './FormulaireConnexion';

export const metadata = { title: 'Se connecter — HERACLES' };

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>;
}) {
  const { suite, erreur } = await searchParams;

  return (
    <main className="enveloppe">
      <h1>Se connecter</h1>

      {erreur === 'lien' && (
        <p className="erreur">
          Ce lien de confirmation n&apos;est plus valable. Connectez-vous, ou demandez un
          nouvel email.
        </p>
      )}

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        <FormulaireConnexion suite={suite} />
      </div>

      <p className="discret" style={{ marginTop: '1.5rem' }}>
        Pas encore de compte ? <Link href="/inscription">En créer un</Link>
      </p>
    </main>
  );
}
