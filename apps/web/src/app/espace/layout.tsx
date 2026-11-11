import Aide from '@/components/aide/Aide';
import { renfortDisponible } from '@/lib/aide/renfort-serveur';
import Barre from '@/components/Barre';
import Colonne from '@/components/Colonne';
import FenetreNouveauCandidat from '@/components/FenetreNouveauCandidat';
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

      {/* La fenêtre « Nouveau candidat », montée une fois : les boutons du
          menu Admin et du volet des candidats l'ouvrent. Pour qui peut
          inviter un parrain, et seulement eux. */}
      {(profil.role === 'referent' || profil.role === 'admin') && <FenetreNouveauCandidat />}

      {/* L'aide, montée une fois elle aussi : son bouton en bas à droite, et
          le personnage qui vient désigner ce qu'on cherche. Elle ne propose
          que ce que le rôle a le droit d'ouvrir. */}
      {/* `renfort` : Claude n'est proposé que si le serveur a sa clé — un
          bouton qui échoue à chaque clic ne rend service à personne. */}
      <Aide role={profil.role} renfort={renfortDisponible()} />
    </div>
  );
}
