import { NextResponse } from 'next/server';
import type { SecteurTrouve } from '@/lib/secteurs';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Chercher un secteur à cocher, par un mot ou un début de code — le champ de
 * recherche du bloc « Secteurs représentés ».
 *
 * La session d'abord ; le droit est dans la base : seuls le Secrétaire d'une
 * loge et l'administration peuvent lancer la recherche
 * (`rechercher_secteur_pour_la_loge`, 0091).
 */
export async function GET(requete: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const q = (new URL(requete.url).searchParams.get('q') ?? '').trim().slice(0, 120);
    if (!q) return NextResponse.json({ resultats: [] });

    const { data, error } = await supabase.rpc('rechercher_secteur_pour_la_loge', { recherche: q });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { erreur: 'La recherche de secteurs est réservée au Secrétaire de la loge.' },
          { status: 403 },
        );
      }
      console.error('[recherche de secteur]', error);
      return NextResponse.json(
        { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ resultats: (data as SecteurTrouve[] | null) ?? [] });
  } catch (souci) {
    console.error('[recherche de secteur]', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
