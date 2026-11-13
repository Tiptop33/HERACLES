import { NextResponse } from 'next/server';
import type { SecteurTrouve } from '@/lib/secteurs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { empreinteDuLien, indisponible, refus } from '../commun';

/**
 * Chercher un secteur à cocher, par un mot ou un début de code, avec le lien
 * du Secrétaire d'une loge du réseau (`rechercher_secteur_par_le_lien`, 0091 :
 * la recherche de 0090, jusqu'aux niveaux fins).
 */
export async function GET(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const lien = empreinteDuLien((await params).jeton);
    if (!lien.ok) return lien.reponse;

    const q = (new URL(requete.url).searchParams.get('q') ?? '').trim().slice(0, 120);
    if (!q) return NextResponse.json({ resultats: [] });

    const { data, error } = await supabaseAdmin().rpc('rechercher_secteur_par_le_lien', {
      empreinte: lien.empreinte,
      recherche: q,
    });
    if (error) return refus('recherche', error);
    return NextResponse.json({ resultats: (data as SecteurTrouve[] | null) ?? [] });
  } catch (souci) {
    console.error('[loge du réseau] recherche : échec inattendu', souci);
    return indisponible();
  }
}
