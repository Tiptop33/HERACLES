import Link from 'next/link';
import FormulaireInscription from './FormulaireInscription';
import VerifierBoiteMail from './VerifierBoiteMail';
import { estRoleInscription, type RoleInscription } from '@/lib/roles';

export const metadata = { title: 'Créer un compte — HERACLES' };

/**
 * Les codes que la route renvoie quand le formulaire est parti sans
 * JavaScript. Chacun sait sous quel champ il s'affiche : une erreur se lit là
 * où elle se corrige.
 */
const ERREURS: Record<string, { champ: string | null; message: string }> = {
  formulaire: {
    champ: 'motDePasse',
    message: 'Il manque quelque chose : nom, prénom, adresse valide, et 8 caractères au minimum.',
  },
  trop: { champ: null, message: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  echec: {
    champ: 'email',
    message: "L'inscription n'a pas abouti. Vérifiez l'adresse et réessayez.",
  },
};

export default async function Inscription({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; erreur?: string; envoye?: string }>;
}) {
  const { role, erreur, envoye } = await searchParams;
  const roleInitial: RoleInscription = estRoleInscription(role) ? role : 'chercheur';

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
          <VerifierBoiteMail />
        ) : (
          <FormulaireInscription
            roleInitial={roleInitial}
            erreurInitiale={erreur ? (ERREURS[erreur] ?? null) : null}
          />
        )}

        <p className="entree-pied">
          {envoye ? (
            <Link href="/connexion">Aller à la connexion</Link>
          ) : (
            <>
              Déjà un compte ? <Link href="/connexion">Se connecter</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
