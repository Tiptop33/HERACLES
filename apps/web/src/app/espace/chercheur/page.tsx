import { redirect } from 'next/navigation';
import Logo from '@/components/Logo';
import { lireIdentifiantDOffre, nettoyerRecherche } from '@/lib/offres';
import { lireOffre } from '@/lib/offres-serveur';
import { OFFRES_DE_LA_PAGE } from '@/lib/page-candidat';
import {
  lireLesDocuments,
  lireLesMessages,
  lireMaFiche,
  lireMesOffres,
  regarderMaPage,
} from '@/lib/page-candidat-serveur';
import { exigerProfil } from '@/lib/profil';
import { accueilDuRole } from '@/lib/roles';
import EspaceCandidat from './EspaceCandidat';
import OffresDuCandidat from './OffresDuCandidat';

export const metadata = { title: 'Mon espace — HERACLES' };

type Parametre = string | string[] | undefined;
const premier = (v: Parametre) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * La page du candidat (0105) : sa fiche, ses documents, ses messages, ses
 * offres. Tout se lit sous sa session — la base ne rend que son dossier.
 *
 * Un compte « chercheur » sans fiche (inscrit seul, avant l'invitation) voit
 * une page d'attente : seule l'invitation de son référent relie un compte à
 * une fiche, jamais une adresse identique.
 */
export default async function EspaceDuCandidat({
  searchParams,
}: {
  searchParams: Promise<{ q?: Parametre; plus?: Parametre; offre?: Parametre }>;
}) {
  const profil = await exigerProfil();
  if (profil.role !== 'chercheur') redirect(accueilDuRole(profil.role));

  // La visite d'abord : c'est elle qui dit ce qui est « nouveau ».
  await regarderMaPage();
  const fiche = await lireMaFiche();

  if (!fiche) {
    return (
      <main className="entree">
        <div className="entree-carte">
          <div className="entree-marque">
            <Logo />
          </div>
          <h1 className="entree-titre">Bonjour {profil.prenom ?? ''}</h1>
          <p className="entree-chapo">
            Votre compte n’est encore relié à aucune fiche. Il le sera quand votre référent vous enverra
            l’invitation à votre espace candidat : ouvrez le lien qu’elle contient.
          </p>
          <form action="/api/deconnexion" method="post">
            <button className="bouton bouton--pleine-largeur" type="submit">
              Se déconnecter
            </button>
          </form>
        </div>
      </main>
    );
  }

  const parametres = await searchParams;
  const recherche = nettoyerRecherche(premier(parametres.q));
  const plus = premier(parametres.plus);
  const limite = /^[1-9][0-9]{0,2}$/.test(plus) ? Math.min(Number(plus), 100) : OFFRES_DE_LA_PAGE;
  const ouverte = lireIdentifiantDOffre(parametres.offre);

  const [documents, messages, offres, detail] = await Promise.all([
    lireLesDocuments(fiche.id),
    lireLesMessages(fiche.id),
    lireMesOffres(recherche, limite),
    ouverte ? lireOffre(ouverte) : null,
  ]);
  const maintenant = new Date().getTime();

  return (
    <EspaceCandidat
      initiale={fiche}
      documents={documents}
      messages={messages}
      maintenant={maintenant}
      offres={
        <OffresDuCandidat
          offres={offres}
          secteurs={fiche.secteurs}
          recherche={recherche}
          limite={limite}
          ouverte={ouverte}
          detail={detail}
          maintenant={maintenant}
        />
      }
    />
  );
}
