import VueAccueil from '@/components/VueAccueil';
import {
  lireChiffres,
  listerDemandesEnAttente,
  listerDocuments,
  listerOffresEnCours,
  saison,
} from '@/lib/accueil';
import { exigerProfil } from '@/lib/profil';

export const metadata = { title: 'Accueil — HERACLES' };

export default async function Accueil() {
  const profil = await exigerProfil();

  const [chiffres, demandes, documents, offres] = await Promise.all([
    lireChiffres(),
    listerDemandesEnAttente(4),
    listerDocuments(5),
    listerOffresEnCours(5),
  ]);

  return (
    <VueAccueil
      saison={saison()}
      chiffres={chiffres}
      demandes={demandes}
      documents={documents}
      offres={offres}
      estReferent={profil.role === 'referent'}
    />
  );
}
