import { NextResponse } from 'next/server';
import { typeDeFichier } from '@/lib/fichiers';
import { cheminEcussonProvincial } from '@/lib/provinces-serveur';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * L'écusson d'une province, pour sa carte.
 *
 * Le même ordre que la photo d'un référent, et pour les mêmes raisons :
 *
 *   1. la session — `cheminEcussonProvincial()` passe par `supabaseServer()` ;
 *   2. le droit — la RLS de `provinces` (migration 0080) ne rend la ligne, donc
 *      le chemin, qu'aux référents et à l'administration. C'est la base qui
 *      tranche, pas cette route ;
 *   3. alors seulement `supabaseAdmin()`, pour lire les octets dans un seau
 *      qui reste fermé.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Un identifiant qui n'en est pas un : un « introuvable » suffit, sans
  // déranger la base.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ erreur: 'Image introuvable.' }, { status: 404 });
  }

  const chemin = await cheminEcussonProvincial(id);

  // Pas d'écusson, pas de province, ou pas le droit : la même réponse.
  if (!chemin) {
    return NextResponse.json({ erreur: 'Image introuvable.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin().storage.from('documents').download(chemin);
  if (error || !data) {
    return NextResponse.json({ erreur: 'Image indisponible.' }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(chemin, data.type),
      // Privé, comme toute réponse qui suppose une session.
      'Cache-Control': 'private, max-age=300',
      // Un fichier venu d'ailleurs : qu'il ne soit lu que comme l'image annoncée.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
