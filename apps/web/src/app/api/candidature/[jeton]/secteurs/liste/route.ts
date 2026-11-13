import { NextResponse } from 'next/server';
import { empreinte } from '@/lib/invitation';
import { jetonPlausible } from '@/lib/parrainage-serveur';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Les 21 sections et 88 divisions, pour « Parcourir la liste des secteurs »
 * du formulaire de candidature (`sections_et_divisions_par_la_candidature`,
 * 0092). Le jeton est le seul droit ; la base dit s'il vaut.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const { jeton } = await params;
    if (!jetonPlausible(jeton)) return NextResponse.json({ erreur: 'Ce lien ne vaut plus.' }, { status: 410 });

    const { data, error } = await supabaseAdmin().rpc('sections_et_divisions_par_la_candidature', {
      empreinte: empreinte(jeton),
    });
    if (error) {
      if (error.code === '28000') return NextResponse.json({ erreur: 'Ce lien ne vaut plus.' }, { status: 410 });
      console.error('[candidature] liste des secteurs', error.code);
      return NextResponse.json({ erreur: 'La liste des secteurs n’a pas pu être chargée.' }, { status: 503 });
    }
    return NextResponse.json({ lignes: data ?? [] }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch (souci) {
    console.error('[candidature] liste des secteurs : échec inattendu', souci);
    return NextResponse.json({ erreur: 'La liste des secteurs n’a pas pu être chargée.' }, { status: 503 });
  }
}
