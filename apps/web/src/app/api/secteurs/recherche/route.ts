import { NextResponse } from 'next/server';
import type { SecteurTrouve } from '@/lib/secteurs';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Chercher un secteur d'activité pour la fiche d'un candidat. La session
 * d'abord ; le droit est dans la base : les référents et l'administration
 * (`rechercher_secteur_pour_un_candidat`, 0092).
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

    const { data, error } = await supabase.rpc('rechercher_secteur_pour_un_candidat', { recherche: q });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json({ erreur: 'La recherche de secteurs est réservée aux référents.' }, { status: 403 });
      }
      console.error('[secteurs] recherche', error.code);
      return NextResponse.json({ erreur: 'La recherche a échoué. Réessayez.' }, { status: 503 });
    }
    return NextResponse.json({ resultats: (data as SecteurTrouve[] | null) ?? [] });
  } catch (souci) {
    console.error('[secteurs] recherche : échec inattendu', souci);
    return NextResponse.json({ erreur: 'La recherche a échoué. Réessayez.' }, { status: 503 });
  }
}
