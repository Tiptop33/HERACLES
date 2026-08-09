import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { jeMeDeconnecte } from '@/lib/presence';
import { origine } from '@/lib/formulaire';

export async function POST(requete: Request) {
  const supabase = await supabaseServer();

  // Avant `signOut()`, tant que la session vaut encore : après, la fonction ne
  // saurait plus quelle ligne effacer, et l'on resterait « là » aux yeux de la
  // loge pendant douze heures.
  await jeMeDeconnecte();

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL('/', origine(requete)), { status: 303 });
}
