import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COLONNES_DU_MESSAGE, lireMessages, validerUnMessage } from '@/lib/page-candidat';
import { exigerMonDossier, lireJson, refus, refusDeLaBase } from '../../commun';

/**
 * Corriger un message, dans les 24 heures (0105). Passé ce délai, la base
 * refuse — quel que soit l'écran qui le demande.
 */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return refus(404, 'Message introuvable.');

  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const corps = await lireJson(requete);
  const verdict = validerUnMessage(corps?.texte);
  if (!verdict.ok) return refus(400, verdict.message, 'texte');

  const { error } = await session.supabase.rpc('corriger_mon_message', { le_message: id, le_texte: verdict.valeur });
  if (error) return refusDeLaBase(error.code, 'correction refusée', 'texte');

  const { data } = await session.supabase.from('candidat_message').select(COLONNES_DU_MESSAGE).eq('id', id);
  return NextResponse.json({ message: lireMessages(data ?? [])[0] ?? null });
}
