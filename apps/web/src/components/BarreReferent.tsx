import Barre from '@/components/Barre';
import type { Profil } from '@/lib/profil';

/** La barre de l'espace référent : la barre commune, avec sa loge à droite. */
export default function BarreReferent({ profil, loge }: { profil: Profil; loge: string | null }) {
  return (
    <Barre
      profil={profil}
      espace="espace référent"
      accueil="/espace/referent"
      cote={loge ? `Loge de ${loge}` : null}
    />
  );
}
