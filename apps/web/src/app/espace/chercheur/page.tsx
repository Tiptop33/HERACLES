import { redirect } from 'next/navigation';
import EnTete from '@/components/EnTete';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Mon espace — HERACLES' };

export default async function EspaceChercheur() {
  const profil = await exigerProfil();
  if (profil.role !== 'chercheur') redirect(accueilDuRole(profil.role));

  return (
    <div className="enveloppe">
      <EnTete profil={profil} />

      <h1>Bonjour {profil.prenom ?? ''}</h1>
      <p className="discret">
        Votre compte est créé. Prochaine étape : compléter votre profil pour que les référents
        sachent qui vous êtes et ce que vous cherchez.
      </p>

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        <h2>Ce qui arrive</h2>
        <p className="discret">
          L&apos;annuaire des référents et la demande de mise en relation arrivent au lot 2.
        </p>
      </div>
    </div>
  );
}
