import { redirect } from 'next/navigation';
import EnTete from '@/components/EnTete';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';

export const metadata = { title: 'Mon espace référent — HERACLES' };

export default async function EspaceReferent() {
  const profil = await exigerProfil();
  if (profil.role !== 'referent') redirect(accueilDuRole(profil.role));

  return (
    <div className="enveloppe">
      <EnTete profil={profil} />

      <h1>Bonjour {profil.prenom ?? ''}</h1>
      <p className="discret">
        Merci d&apos;accompagner. Complétez votre profil : c&apos;est lui que verront les
        personnes en recherche.
      </p>

      <div className="carte" style={{ marginTop: '1.5rem' }}>
        <h2>Ce qui arrive</h2>
        <p className="discret">
          Votre fiche dans l&apos;annuaire — domaines, type d&apos;accompagnement, disponibilité —
          et les demandes de mise en relation arrivent au lot 2. Votre profil y sera publié après
          validation.
        </p>
      </div>
    </div>
  );
}
