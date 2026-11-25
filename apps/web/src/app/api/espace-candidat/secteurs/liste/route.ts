import { NextResponse } from 'next/server';
import { exigerMonDossier } from '../../commun';

/** Les sections et divisions de la NAF, pour parcourir la liste (0105). */
export async function GET() {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const { data, error } = await session.supabase.rpc('sections_et_divisions_pour_ma_fiche');
  if (error) {
    console.error('[page-candidat] liste des secteurs', error.code);
    return NextResponse.json({ erreur: 'La liste des secteurs n’a pas pu être chargée.' }, { status: 503 });
  }
  return NextResponse.json({ lignes: data ?? [] }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
