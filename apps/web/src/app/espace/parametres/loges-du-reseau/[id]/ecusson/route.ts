import { NextResponse } from 'next/server';
import { typeDeFichier } from '@/lib/fichiers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * L'écusson d'une loge du réseau, pour sa ligne dans Paramètres › Loges du
 * réseau.
 *
 *   1. la session — `supabaseServer()` ;
 *   2. le droit — `ecusson_de_la_loge_du_reseau` (0091) ne rend le chemin qu'à
 *      l'administration. C'est la base qui tranche, pas cette route ;
 *   3. alors seulement `supabaseAdmin()`, pour lire les octets dans un seau
 *      qui reste fermé.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ erreur: 'Image introuvable.' }, { status: 404 });
  }

  const { data: chemin, error } = await (await supabaseServer()).rpc('ecusson_de_la_loge_du_reseau', {
    la_loge: id,
  });
  // Pas d'écusson, pas de loge, ou pas le droit : la même réponse.
  if (error || typeof chemin !== 'string') {
    return NextResponse.json({ erreur: 'Image introuvable.' }, { status: 404 });
  }

  const { data, error: souci } = await supabaseAdmin().storage.from('documents').download(chemin);
  if (souci || !data) {
    return NextResponse.json({ erreur: 'Image indisponible.' }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(chemin, data.type),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
