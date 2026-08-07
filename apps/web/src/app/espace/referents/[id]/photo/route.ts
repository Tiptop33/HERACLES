import { NextResponse } from 'next/server';
import { typeDeFichier } from '@/lib/fichiers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * La photo d'un référent.
 *
 * L'ordre imposé par le projet, dans cet ordre-là :
 *
 *   1. la session — `supabaseServer()` porte celle de la personne connectée ;
 *   2. le droit métier — `chemin_photo_referent()` ne rend le chemin que si
 *      cette personne a le droit de voir cette fiche (migration 0015). C'est la
 *      base qui tranche, pas cette route ;
 *   3. alors seulement `supabaseAdmin()`, pour aller chercher les octets dans
 *      un seau qui reste fermé.
 *
 * Les octets passent par ici plutôt que par une adresse signée : une adresse
 * signée, même d'une minute, est une adresse qui circule. Chez Bubble, ces
 * photos pendaient à un CDN public — qui avait le lien avait le visage.
 */

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Un identifiant qui n'est pas un identifiant : la base lèverait une erreur
  // là où un « introuvable » suffit.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ erreur: 'Photo introuvable.' }, { status: 404 });
  }

  const supabase = await supabaseServer();
  const { data: chemin } = await supabase.rpc('chemin_photo_referent', { referent: id });

  // Pas de photo, ou pas le droit de la voir : la même réponse pour les deux.
  // Distinguer les deux cas apprendrait à qui tâtonne qui existe et qui non.
  if (!chemin || typeof chemin !== 'string') {
    return NextResponse.json({ erreur: 'Photo introuvable.' }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin().storage.from('documents').download(chemin);
  if (error || !data) {
    return NextResponse.json({ erreur: 'Photo indisponible.' }, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(chemin, data.type),
      // Privé, et court : le droit de voir cette photo peut être retiré, et un
      // cache partagé n'en saurait rien.
      'Cache-Control': 'private, max-age=300',
      // Le fichier vient d'ailleurs : qu'aucun navigateur ne se mette en tête
      // de l'interpréter autrement que comme l'image annoncée.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
