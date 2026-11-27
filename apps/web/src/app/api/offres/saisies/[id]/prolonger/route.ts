import { NextResponse } from 'next/server';
import { z } from 'zod';
import { refusDeLaBase } from '@/lib/offres-saisies-serveur';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Prolonger une offre saisie de trente jours, à compter d'aujourd'hui (0114).
 * La session d'abord ; le droit est dans la base : son auteur et
 * l'administration (`prolonger_une_offre`). Rend la nouvelle fin de mise en
 * ligne.
 */
export async function POST(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette offre n’existe plus.' }, { status: 404 });
    }
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const { data, error } = await supabase.rpc('prolonger_une_offre', { l_offre: id });
    if (error) return refusDeLaBase(error, 'L’offre n’a pas pu être prolongée. Réessayez.');
    return NextResponse.json({ en_ligne_jusqu_au: data as string });
  } catch (souci) {
    console.error('[offres saisies] prolongation : échec inattendu', souci);
    return NextResponse.json({ erreur: 'L’offre n’a pas pu être prolongée. Réessayez.' }, { status: 503 });
  }
}
