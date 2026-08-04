import { redirect } from 'next/navigation';
import EnTete from '@/components/EnTete';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Administration — HERACLES' };

/**
 * Coquille : le rôle « admin » ne s'attribue qu'en base (clé service_role), il
 * n'existe donc encore aucun compte de ce type. La page est là pour que la
 * redirection par rôle ne tombe jamais dans le vide. L'administration réelle —
 * validation des référents, référentiels — arrive au lot 4.
 */
export default async function EspaceAdmin() {
  const profil = await exigerProfil();
  if (profil.role !== 'admin') redirect(accueilDuRole(profil.role));

  return (
    <div className="enveloppe">
      <EnTete profil={profil} />
      <h1>Administration</h1>
      <p className="discret">
        Validation des référents, référentiels et statistiques arrivent au lot 4.
      </p>
    </div>
  );
}
