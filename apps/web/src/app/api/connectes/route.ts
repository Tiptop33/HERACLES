import { NextResponse } from 'next/server';
import { lireLesConnectes } from '@/lib/presence';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Qui est là, pour le rafraîchissement de la colonne de gauche.
 *
 * La seule route de l'application interrogée par un script. Elle ne rend que
 * ce que la colonne affiche — identifiant, nom, prénom, et s'il y a un visage
 * à montrer. Jamais une adresse, jamais un téléphone : une liste rafraîchie
 * toutes les trente secondes n'a pas à charrier l'annuaire.
 *
 * Le filtrage est celui de `les_connectes()` (migration 0042) : la loge, et
 * rien d'autre. Il n'y a pas de paramètre à cette route, donc rien à forger.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ connectes: [] }, { status: 401 });

    return NextResponse.json(
      { connectes: await lireLesConnectes() },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (souci) {
    console.error('[connectes] échec inattendu', souci);
    // Une liste vide plutôt qu'une erreur : ce n'est qu'un ornement de la
    // colonne, il n'a pas à faire clignoter un message à l'écran.
    return NextResponse.json({ connectes: [] }, { status: 200 });
  }
}
