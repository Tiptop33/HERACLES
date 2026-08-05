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

      {/* Envoi sans JavaScript : l'issue revient par un code dans l'adresse, et
          c'est ici qu'on la met en mots. Un message porté par l'adresse
          laisserait un lien fabriqué afficher ce qu'il veut sur nos pages. */}
      {erreur === 'identifiants' && (
        <p className="erreur">Adresse email ou mot de passe incorrect.</p>
      )}

      {erreur === 'formulaire' && (
        <p className="erreur">Renseignez votre adresse email et votre mot de passe.</p>
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
