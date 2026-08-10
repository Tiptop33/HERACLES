import Barre from '@/components/Barre';
import Colonne from '@/components/Colonne';
import { cheminLogo } from '@/lib/logo';
import { lireLesConnectes } from '@/lib/presence';
import { exigerProfil, lireMaPhoto } from '@/lib/profil';
import { referentCourant } from '@/lib/candidat';

/**
 * La coquille des espaces de travail : la colonne de gauche, la barre du haut,
 * et l'écran demandé.
 *
 * Un chercheur n'y a pas droit : la colonne parle d'accompagnement, de loges
 * et d'offres à distribuer. Son espace à lui garde sa propre barre.
 */
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const profil = await exigerProfil();

  if (profil.role === 'chercheur') return <>{children}</>;

  // `lireMaPhoto()` sans condition de rôle : un administrateur peut avoir sa
  // fiche de référent, et la fonction rend simplement `null` quand il n'y en
  // a pas. Réserver l'appel aux référents priverait de photo ceux qui en ont
  // une, pour une économie d'une requête.
  const [referent, connectes, maPhoto] = await Promise.all([
    profil.role === 'referent' ? referentCourant() : Promise.resolve(null),
    lireLesConnectes(),
    lireMaPhoto(),
  ]);

  return (
    <div className="atelier">
      <Colonne profil={profil} logo={cheminLogo} connectes={connectes} photo={maPhoto} />

      <div className="atelier-corps">
        <Barre
          profil={profil}
          espace={profil.role === 'admin' ? 'administration' : 'espace référent'}
          accueil="/espace/accueil"
          cote={referent?.loge ? `Loge de ${referent.loge}` : null}
        />
        {children}
      </div>
    </div>
  );
}
