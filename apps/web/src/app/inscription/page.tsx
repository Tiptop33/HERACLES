import Link from 'next/link';
import FormulaireInscription from './FormulaireInscription';
import VerifierBoiteMail from './VerifierBoiteMail';
import { estRoleInscription, type RoleInscription } from '@/lib/roles';

export const metadata = { title: 'Créer un compte — HERACLES' };

export default async function Inscription({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; erreur?: string; envoye?: string }>;
}) {
  const { role, erreur, envoye } = await searchParams;
  const roleInitial: RoleInscription = estRoleInscription(role) ? role : 'chercheur';

  return (
    <main className="enveloppe">
      <h1>Créer un compte</h1>
      {!envoye && (
        <p className="discret">
          Deux minutes suffisent. Vous recevrez un email pour confirmer votre adresse.
        </p>
      )}

      {/* Envoi sans JavaScript : l'issue revient par un code dans l'adresse, et
          c'est ici qu'on la met en mots. Un message porté par l'adresse
          laisserait un lien fabriqué afficher ce qu'il veut sur nos pages. */}
      {erreur === 'formulaire' && (
        <p className="erreur">
          Il manque quelque chose : nom, prénom, adresse email valide, et un mot de passe de 8
          caractères au minimum.
        </p>
      )}

      {erreur === 'trop' && (
        <p className="erreur">Trop de tentatives. Réessayez dans quelques minutes.</p>
      )}

      {erreur === 'echec' && (
        <p className="erreur">
          L&apos;inscription n&apos;a pas abouti. Vérifiez l&apos;adresse et réessayez.
        </p>
      )}

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        {envoye ? <VerifierBoiteMail /> : <FormulaireInscription roleInitial={roleInitial} />}
      </div>

      {!envoye && (
        <p className="discret" style={{ marginTop: '1.5rem' }}>
          Déjà un compte ? <Link href="/connexion">Se connecter</Link>
        </p>
      )}
    </main>
  );
}
