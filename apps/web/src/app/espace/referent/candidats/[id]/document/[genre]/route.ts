import { NextResponse } from 'next/server';
import { lireCandidat } from '@/lib/candidat';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Télécharger un document d'un candidat.
 *
 * Chez Bubble, ces fichiers étaient servis par un CDN public : qui avait
 * l'adresse avait le CV. Ici, on passe d'abord par `lireCandidat`, donc par la
 * RLS — si la fiche n'est pas rattachée à la personne connectée, la requête ne
 * renvoie rien et le téléchargement s'arrête là. L'adresse signée ensuite
 * délivrée ne vaut qu'une minute.
 */

const GENRES = {
  cv: 'cv_chemin',
  lettre: 'lettre_motivation_chemin',
  'cv-anonyme': 'cv_anonyme_chemin',
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

  const candidat = await lireCandidat(id);
  if (!candidat) {
    return NextResponse.json({ erreur: 'Document introuvable.' }, { status: 404 });
  }

  const chemin = candidat[GENRES[genre]];
  if (!chemin) {
    return NextResponse.json(
      { erreur: "Ce document n'a pas encore été rapatrié depuis Bubble." },
      { status: 404 },
    );
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(chemin, 60, { download: true });

  if (error || !data) {
    return NextResponse.json({ erreur: 'Le document est indisponible.' }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
