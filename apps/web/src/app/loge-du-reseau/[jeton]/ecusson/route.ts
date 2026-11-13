import { NextResponse } from 'next/server';
import { typeDeFichier } from '@/lib/fichiers';
import { empreinte } from '@/lib/invitation';
import { jetonPlausible } from '@/lib/parrainage-serveur';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * L'écusson de la loge, en tête de la page du Secrétaire.
 *
 * Le jeton de l'adresse est le seul droit, comme pour la page : un jeton qui
 * n'en a pas la forme est refusé sans requête ; sinon son empreinte va à la
 * base, qui dit si le lien vaut et rend le chemin (`ecusson_par_le_lien`,
 * 0091). Alors seulement le seau est lu.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  if (!jetonPlausible(jeton)) {
    return NextResponse.json({ erreur: 'Image introuvable.' }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data: chemin, error } = await admin.rpc('ecusson_par_le_lien', { empreinte: empreinte(jeton) });
  // Lien mort, loge sans écusson : la même réponse.
  if (error || typeof chemin !== 'string') {
    return NextResponse.json({ erreur: 'Image introuvable.' }, { status: 404 });
  }

  const { data, error: souci } = await admin.storage.from('documents').download(chemin);
  if (souci || !data) {
    return NextResponse.json({ erreur: 'Image indisponible.' }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(chemin, data.type),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // L'adresse porte le jeton : qu'elle ne parte pas avec l'image.
      'Referrer-Policy': 'no-referrer',
    },
  });
}
