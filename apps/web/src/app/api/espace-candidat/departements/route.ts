import { NextResponse } from 'next/server';
import { lireDepartements } from '@/lib/page-candidat';
import { exigerMonDossier, lireJson, refus, refusDeLaBase } from '../commun';

/** Retenir les départements cochés pour ses offres (0105). Aucun coché : tous. */
export async function POST(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const departements = lireDepartements((await lireJson(requete))?.departements);
  if (!departements) return refus(400, 'Ces départements ne se lisent pas.');

  const { error } = await session.supabase.rpc('retenir_mes_departements', { les_departements: departements });
  if (error) return refusDeLaBase(error.code, 'départements refusés');
  return NextResponse.json({ ok: true, departements });
}
