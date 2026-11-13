import { NextResponse } from 'next/server';
import { empreinte } from '@/lib/invitation';
import { jetonPlausible } from '@/lib/parrainage-serveur';
import type { SecteurTrouve } from '@/lib/secteurs';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Chercher un secteur d'activité, par un mot ou un début de code, depuis le
 * formulaire de candidature (écran 1 de docs/maquettes/secteurs-d-activite.html).
 *
 * Sans compte : le jeton est le seul droit. Un jeton qui n'en a pas la forme
 * est refusé sans requête ; sinon son empreinte va à la base, qui dit si le
 * lien vaut (`rechercher_secteur_par_la_candidature`, 0092), avec la clé de
 * service — comme `completer_sa_candidature`.
 */
export async function GET(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const { jeton } = await params;
    if (!jetonPlausible(jeton)) return NextResponse.json({ erreur: 'Ce lien ne vaut plus.' }, { status: 410 });

    const q = (new URL(requete.url).searchParams.get('q') ?? '').trim().slice(0, 120);
    if (!q) return NextResponse.json({ resultats: [] });

    const { data, error } = await supabaseAdmin().rpc('rechercher_secteur_par_la_candidature', {
      empreinte: empreinte(jeton),
      recherche: q,
    });
    if (error) {
      if (error.code === '28000') return NextResponse.json({ erreur: 'Ce lien ne vaut plus.' }, { status: 410 });
      console.error('[candidature] recherche de secteur', error.code);
      return NextResponse.json({ erreur: 'La recherche a échoué. Réessayez.' }, { status: 503 });
    }
    return NextResponse.json({ resultats: (data as SecteurTrouve[] | null) ?? [] });
  } catch (souci) {
    console.error('[candidature] recherche de secteur : échec inattendu', souci);
    return NextResponse.json({ erreur: 'La recherche a échoué. Réessayez.' }, { status: 503 });
  }
}
