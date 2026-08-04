import Link from 'next/link';
import FormulaireInscription from './FormulaireInscription';
import { estRoleInscription, type RoleInscription } from '@/lib/roles';

export const metadata = { title: 'Créer un compte — HERACLES' };

export default async function Inscription({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const roleInitial: RoleInscription = estRoleInscription(role) ? role : 'chercheur';

  return (
    <main className="enveloppe">
      <h1>Créer un compte</h1>
      <p className="discret">
        Deux minutes suffisent. Vous recevrez un email pour confirmer votre adresse.
      </p>

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        <FormulaireInscription roleInitial={roleInitial} />
      </div>

      <p className="discret" style={{ marginTop: '1.5rem' }}>
        Déjà un compte ? <Link href="/connexion">Se connecter</Link>
      </p>
    </main>
  );
}
