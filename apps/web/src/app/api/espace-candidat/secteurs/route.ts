import { NextResponse } from 'next/server';
import { CODE_DE_CANDIDAT, SECTEURS_PAR_CANDIDAT } from '@/lib/secteurs';
import { exigerMonDossier, lireJson, refus } from '../commun';

/**
 * Poser ses secteurs, dans l'ordre (0105). Ce qui était confirmé le reste ; ce
 * qui s'ajoute attend son référent — c'est la base qui en décide
 * (`proposer_mes_secteurs`).
 */
export async function POST(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const corps = await lireJson(requete);
  const codes = corps?.codes;
  if (
    !Array.isArray(codes) ||
    codes.length > SECTEURS_PAR_CANDIDAT ||
    !codes.every((c) => typeof c === 'string' && CODE_DE_CANDIDAT.test(c)) ||
    new Set(codes).size !== codes.length
  ) {
    return refus(400, 'Ces secteurs ne se lisent pas. Choisissez-les de nouveau.');
  }

  const { data, error } = await session.supabase.rpc('proposer_mes_secteurs', { codes });
  if (error) {
    if (error.code === '23514' || error.code === '23503') {
      return refus(400, 'Un secteur choisi n’est pas reconnu. Choisissez-le de nouveau.');
    }
    console.error('[page-candidat] secteurs refusés', error.code);
    return refus(503, 'L’enregistrement a échoué. Réessayez.');
  }
  return NextResponse.json({ secteurs: data ?? [] });
}
