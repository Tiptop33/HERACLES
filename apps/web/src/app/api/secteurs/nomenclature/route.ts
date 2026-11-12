import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Toute la nomenclature NAF, pour l'arborescence à cocher du bloc « Secteurs
 * représentés ». L'écran ne la demande qu'à l'ouverture de l'arborescence.
 *
 * La session d'abord ; le droit est dans la base : le Secrétaire d'une loge et
 * l'administration (`nomenclature_naf_pour_la_loge`, 0091). La nomenclature ne
 * change pas d'un jour à l'autre : le navigateur la garde une heure.
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const { data, error } = await supabase.rpc('nomenclature_naf_pour_la_loge');
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { erreur: 'La liste des secteurs est réservée au Secrétaire de la loge.' },
          { status: 403 },
        );
      }
      console.error('[nomenclature]', error);
      return NextResponse.json(
        { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { lignes: data ?? [] },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (souci) {
    console.error('[nomenclature]', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
