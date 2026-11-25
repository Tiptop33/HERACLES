import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enTeteDeTelechargement, extensionDe, typeDeFichier } from '@/lib/fichiers';
import { validerUnNom } from '@/lib/page-candidat';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exigerMonDossier, lireJson, refus, refusDeLaBase } from '../../commun';

/**
 * Un document du candidat (0105) : l'ouvrir, le renommer, en faire le
 * principal, le supprimer pour de bon.
 */

type Contexte = { params: Promise<{ id: string }> };

async function lireLId(contexte: Contexte): Promise<string | null> {
  const { id } = await contexte.params;
  return z.uuid().safeParse(id).success ? id : null;
}

export async function GET(_requete: Request, contexte: Contexte) {
  const id = await lireLId(contexte);
  if (!id) return refus(404, 'Document introuvable.');
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  // Sous la session : la RLS ne rend que ses propres documents.
  const { data } = await session.supabase
    .from('candidat_document')
    .select('nom, chemin')
    .eq('id', id)
    .eq('candidat_id', session.dossier)
    .maybeSingle();
  const doc = data as { nom: string; chemin: string } | null;
  if (!doc) return refus(404, 'Document introuvable.');

  const { data: octets, error } = await supabaseAdmin().storage.from('documents').download(doc.chemin);
  if (error || !octets) return refus(404, 'Le document est indisponible.');

  return new NextResponse(await octets.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(doc.chemin, octets.type),
      'Content-Disposition': enTeteDeTelechargement(`${doc.nom}${extensionDe(doc.chemin)}`),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function PATCH(requete: Request, contexte: Contexte) {
  const id = await lireLId(contexte);
  if (!id) return refus(404, 'Document introuvable.');
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const corps = await lireJson(requete);

  if (corps?.principal === true) {
    const { error } = await session.supabase.rpc('choisir_mon_document_principal', { le_document: id });
    if (error) return refusDeLaBase(error.code, 'principal refusé');
    return NextResponse.json({ ok: true });
  }

  const verdict = validerUnNom(corps?.nom);
  if (!verdict.ok) return refus(400, verdict.message, 'nom');
  const { error } = await session.supabase.rpc('renommer_mon_document', { le_document: id, le_nom: verdict.valeur });
  if (error) return refusDeLaBase(error.code, 'nom refusé', 'nom');
  return NextResponse.json({ ok: true, nom: verdict.valeur });
}

export async function DELETE(_requete: Request, contexte: Contexte) {
  const id = await lireLId(contexte);
  if (!id) return refus(404, 'Document introuvable.');
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const { data: chemin, error } = await session.supabase.rpc('supprimer_mon_document', { le_document: id });
  if (error) return refusDeLaBase(error.code, 'suppression refusée');

  // La base a parlé : le fichier quitte le seau. S'il n'y arrive pas, la ligne
  // est déjà partie — on le dit au journal, la personne n'y peut rien.
  if (typeof chemin === 'string') {
    const { error: souci } = await supabaseAdmin().storage.from('documents').remove([chemin]);
    if (souci) console.error('[page-candidat] fichier resté dans le seau après suppression');
  }
  return NextResponse.json({ ok: true });
}
