import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { empreinteDuLien, indisponible, refus } from '../commun';

/**
 * Toute la nomenclature NAF, pour l'arborescence à cocher de la page du
 * Secrétaire (`nomenclature_par_le_lien`, 0091). L'écran ne la demande qu'à
 * l'ouverture de l'arborescence ; elle ne change pas d'un jour à l'autre, le
 * navigateur la garde une heure.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const lien = empreinteDuLien((await params).jeton);
    if (!lien.ok) return lien.reponse;

    const { data, error } = await supabaseAdmin().rpc('nomenclature_par_le_lien', {
      empreinte: lien.empreinte,
    });
    if (error) return refus('nomenclature', error);
    return NextResponse.json(
      { lignes: data ?? [] },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (souci) {
    console.error('[loge du réseau] nomenclature : échec inattendu', souci);
    return indisponible();
  }
}
