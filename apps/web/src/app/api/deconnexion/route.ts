import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { origine } from '@/lib/formulaire';

export async function POST(requete: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL('/', origine(requete)), { status: 303 });
}
