import { NextResponse } from 'next/server';
import { enTeteDeTelechargement, extensionDe, typeDeFichier } from '@/lib/fichiers';
import { lireFiche } from '@/lib/poste';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Télécharger un document d'un candidat.
 *
 * Chez Bubble, ces fichiers étaient servis par un CDN public : qui avait
 * l'adresse avait le CV. Ici, l'ordre est celui que le projet impose, et
 * jamais un autre :
 *
 *   1. la session et le droit métier — `lireFiche` passe par
 *      `fiche_candidat()` (migration 0020), qui n'ouvre qu'aux candidats de
 *      ses loges. Hors de là, la base ne rend rien et tout s'arrête ;
 *   2. alors seulement `supabaseAdmin()`, pour lire les octets.
 *
 * La règle est celle de la fiche, et c'est voulu : un document qu'on voit
 * nommé sur un écran doit pouvoir s'ouvrir depuis cet écran. L'inverse — une
 * carte « CV » qui renvoie une erreur — apprend à douter de l'application.
 *
 * Le seau `documents` est privé et ne porte aucune policy : une adresse signée
 * demandée sous la clé anonyme ne peut pas aboutir. Les octets passent donc par
 * ici — ce qui vaut mieux de toute façon, une adresse signée étant une adresse
 * qui circule.
 */

const GENRES = {
  cv: { colonne: 'cv_chemin', intitule: 'CV' },
  lettre: { colonne: 'lettre_motivation_chemin', intitule: 'Lettre de motivation' },
  'cv-anonyme': { colonne: 'cv_anonyme_chemin', intitule: 'CV anonyme' },
} as const;

type Genre = keyof typeof GENRES;

function estGenre(valeur: string): valeur is Genre {
  return valeur in GENRES;
}

export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string; genre: string }> },
) {
  const { id, genre } = await params;

  if (!estGenre(genre)) {
    return NextResponse.json({ erreur: 'Document inconnu.' }, { status: 404 });
  }

  const candidat = await lireFiche(id);
  if (!candidat) {
    return NextResponse.json({ erreur: 'Document introuvable.' }, { status: 404 });
  }

  const { colonne, intitule } = GENRES[genre];
  const chemin = candidat[colonne];
  if (!chemin) {
    return NextResponse.json(
      { erreur: "Ce document n'a pas encore été rapatrié depuis Bubble." },
      { status: 404 },
    );
  }

  const { data, error } = await supabaseAdmin().storage.from('documents').download(chemin);
  if (error || !data) {
    return NextResponse.json({ erreur: 'Le document est indisponible.' }, { status: 404 });
  }

  // « CV - MARTIN Alice.pdf » plutôt que « candidat/cv/1733742885881x42.pdf ».
  // Le fichier atterrit dans un dossier de téléchargements où il devra se
  // reconnaître tout seul.
  const personne = [candidat.nom, candidat.prenom].filter(Boolean).join(' ');
  const nom = `${intitule}${personne ? ` - ${personne}` : ''}${extensionDe(chemin)}`;

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(chemin, data.type),
      'Content-Disposition': enTeteDeTelechargement(nom),
      // Un CV n'a rien à faire dans un cache partagé, ni à survivre au retrait
      // d'un droit.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
