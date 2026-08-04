import EnTete from '@/components/EnTete';
import { exigerProfil } from '@/lib/profil';
import { libelleDuRole } from '@/lib/roles';
import FormulaireProfil from './FormulaireProfil';

export const metadata = { title: 'Mon compte — HERACLES' };

export default async function MonCompte() {
  const profil = await exigerProfil();

  return (
    <div className="enveloppe">
      <EnTete profil={profil} />

      <h1>Mon compte</h1>
      <p className="discret">
        Vous êtes inscrit comme <strong>{libelleDuRole(profil.role)}</strong>. Ce choix ne se
        modifie pas depuis cette page : écrivez-nous s&apos;il faut le changer.
      </p>

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        <FormulaireProfil profil={profil} />
      </div>
    </div>
  );
}
