import { NextResponse } from 'next/server';
import type { SecteurTrouve } from '@/lib/secteurs';
import { exigerMonDossier } from '../../commun';

/** Chercher un secteur par un mot ou un début de code, depuis sa page (0105). */
export async function GET(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const q = (new URL(requete.url).searchParams.get('q') ?? '').trim().slice(0, 120);
  if (!q) return NextResponse.json({ resultats: [] });

  const { data, error } = await session.supabase.rpc('rechercher_un_secteur_pour_ma_fiche', { recherche: q });
  if (error) {
    console.error('[page-candidat] recherche de secteur', error.code);
    return NextResponse.json({ erreur: 'La recherche a échoué. Réessayez.' }, { status: 503 });
  }
  return NextResponse.json({ resultats: (data as SecteurTrouve[] | null) ?? [] });
}
