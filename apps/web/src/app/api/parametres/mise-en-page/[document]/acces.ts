import { NextResponse } from 'next/server';
import { estUnDocument, type DocumentCle } from '@/lib/documents/gabarits';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * La porte commune des routes de Paramètres › Mise en page.
 *
 * La session d'abord, puis le droit : l'administration seulement. Les
 * fonctions d'écriture de 0067 refusent d'elles-mêmes une autre session — ce
 * contrôle-ci évite seulement de produire un aperçu pour rien, et répond
 * clairement.
 */
export async function ouvrir(
  document: string,
): Promise<
  | { ok: true; document: DocumentCle; supabase: Awaited<ReturnType<typeof supabaseServer>> }
  | { ok: false; reponse: NextResponse }
> {
  if (!estUnDocument(document)) {
    return { ok: false, reponse: NextResponse.json({ erreur: 'Document inconnu.' }, { status: 404 }) };
  }
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reponse: NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 }) };
  }
  const { data: admin } = await supabase.rpc('est_admin');
  if (admin !== true) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'La mise en page se règle par l’administration.' }, { status: 403 }),
    };
  }
  return { ok: true, document, supabase };
}

export function indisponible(etiquette: string, souci: unknown) {
  console.error(`[mise-en-page] ${etiquette}`, souci);
  return NextResponse.json(
    { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
    { status: 503 },
  );
}
