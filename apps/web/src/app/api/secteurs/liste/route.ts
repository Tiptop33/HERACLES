import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Les 21 sections et 88 divisions, pour « Parcourir la liste des secteurs »
 * de la fiche d'un candidat. La session d'abord ; le droit est dans la base
 * (`sections_et_divisions_pour_un_candidat`, 0092).
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const { data, error } = await supabase.rpc('sections_et_divisions_pour_un_candidat');
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json({ erreur: 'La liste des secteurs est réservée aux référents.' }, { status: 403 });
      }
      console.error('[secteurs] liste', error.code);
      return NextResponse.json({ erreur: 'La liste des secteurs n’a pas pu être chargée.' }, { status: 503 });
    }
    return NextResponse.json({ lignes: data ?? [] }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch (souci) {
    console.error('[secteurs] liste : échec inattendu', souci);
    return NextResponse.json({ erreur: 'La liste des secteurs n’a pas pu être chargée.' }, { status: 503 });
  }
}
