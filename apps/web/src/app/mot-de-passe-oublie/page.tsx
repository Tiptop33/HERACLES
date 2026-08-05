import Link from 'next/link';
import FormulaireOubli from './FormulaireOubli';

export const metadata = { title: 'Mot de passe oublié — HERACLES' };

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
          <span className="entree-logo" aria-hidden="true">
            H
          </span>
          <h1>HERACLES</h1>
        </div>

        {envoye ? (
          <>
            <h2 style={{ fontSize: '1.1rem', textAlign: 'center' }}>Vérifiez votre boîte mail</h2>
            {/* Toujours le même message, que l'adresse soit inscrite ou non :
                répondre « adresse inconnue » dirait qui a un compte ici. */}
            <p className="discret" style={{ textAlign: 'center' }}>
              Si cette adresse correspond à un compte, un lien de réinitialisation vient de
              partir. Pensez à regarder dans les indésirables.
            </p>
          </>
        ) : (
          <>
            <p className="discret" style={{ marginTop: 0 }}>
              Indiquez votre adresse e-mail : nous vous enverrons un lien pour choisir un
              nouveau mot de passe.
            </p>
            <FormulaireOubli erreurInitiale={erreur === 'formulaire'} />
          </>
        )}

        <p className="entree-pied">
          <Link href="/connexion">Revenir à la connexion</Link>
        </p>
      </div>
    </main>
  );
}
