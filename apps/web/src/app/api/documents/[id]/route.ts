import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enPdf } from '@/lib/documents/archives';
import { enTeteDeTelechargement } from '@/lib/fichiers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Ouvrir un compte rendu, une affiche ou une affichette archivés — une ligne
 * des trois colonnes de l'accueil (migration 0069).
 *
 * L'ordre du projet :
 *
 *   1. la session ;
 *   2. la ligne, lue sous la session : la policy de `document` ne rend que les
 *      PDF de ses loges, jamais un PDF effacé. Hors de là, rien ;
 *   3. alors seulement `supabaseAdmin()`, pour lire les octets du seau privé.
 *
 * Un PDF repris de Bubble pas encore rapatrié n'a que son adresse d'origine,
 * sur le CDN de Bubble : on y renvoie, comme le faisait l'accueil jusqu'ici.
 * Après MAJBUBBLE, tous ont un chemin chez nous et ce détour disparaît.
 */

export const runtime = 'nodejs';

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const introuvable = () =>
    NextResponse.json({ erreur: 'Ce document n’existe pas.' }, { status: 404 });

  if (!z.uuid().safeParse(id).success) return introuvable();

  try {
    // 1. La session.
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    // 2. La ligne, sous la RLS.
    const { data: document } = await supabase
      .from('document')
      .select('nom, chemin, lien_url')
      .eq('id', id)
      .maybeSingle();
    if (!document) return introuvable();

    if (!document.chemin) {
      const adresse = adresseDeBubble(document.lien_url);
      return adresse ? NextResponse.redirect(adresse, 302) : introuvable();
    }

    // 3. Le seau.
    const { data: fichier, error } = await supabaseAdmin()
      .storage.from('documents')
      .download(document.chemin);
    if (error || !fichier) {
      console.error('[documents] fichier introuvable dans le seau', error?.message);
      return NextResponse.json({ erreur: 'Le document est indisponible.' }, { status: 404 });
    }

    return new NextResponse(await fichier.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        // `inline`, comme les boutons de la feuille d'appel : le PDF s'ouvre
        // dans le lecteur du navigateur, et garde son nom pour l'enregistrer.
        'Content-Disposition': enTeteDeTelechargement(enPdf(document.nom ?? 'Document'), 'inline'),
        // Le compte rendu porte des coordonnées : aucun cache partagé.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    console.error('[documents] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le document n’a pas pu être ouvert. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}

/**
 * L'adresse Bubble d'un PDF pas encore rapatrié, en `https`, ou `null`.
 * Bubble l'écrit souvent sans protocole (« //xxx.cdn.bubble.io/… ») ; tout ce
 * qui ne serait pas une adresse web n'est pas suivi.
 */
function adresseDeBubble(lien: string | null): string | null {
  if (!lien) return null;
  const complete = lien.startsWith('//') ? `https:${lien}` : lien;
  try {
    const url = new URL(complete);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
