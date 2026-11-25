import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enTeteDeTelechargement, extensionDe, typeDeFichier } from '@/lib/fichiers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Ouvrir un CV ou une lettre déposés par le candidat sur sa page (0105).
 *
 * Même ordre que `document/[genre]` : la session, puis le droit — la ligne
 * se lit sous RLS, et la policy de `candidat_document` est celle de la fiche
 * (`puis_je_lire_ce_candidat`) —, alors seulement la clé de service pour les
 * octets.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(doc).success) {
    return NextResponse.json({ erreur: 'Document introuvable.' }, { status: 404 });
  }

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('candidat_document')
    .select('nom, chemin')
    .eq('id', doc)
    .eq('candidat_id', id)
    .maybeSingle();
  const ligne = data as { nom: string; chemin: string } | null;
  if (!ligne) return NextResponse.json({ erreur: 'Document introuvable.' }, { status: 404 });

  const { data: octets, error } = await supabaseAdmin().storage.from('documents').download(ligne.chemin);
  if (error || !octets) return NextResponse.json({ erreur: 'Le document est indisponible.' }, { status: 404 });

  return new NextResponse(await octets.arrayBuffer(), {
    headers: {
      'Content-Type': typeDeFichier(ligne.chemin, octets.type),
      'Content-Disposition': enTeteDeTelechargement(`${ligne.nom}${extensionDe(ligne.chemin)}`),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
