import { NextResponse } from 'next/server';
import { nomDeLAffichette } from '@/lib/documents/affichette';
import { donneesDeLAffichette } from '@/lib/documents/donnees';
import { produireLAffichette } from '@/lib/documents/produire';
import { enTeteDeTelechargement } from '@/lib/fichiers';
import { origine } from '@/lib/formulaire';
import { lireFiche } from '@/lib/poste';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * L'affichette d'un dossier, en PDF — celle de Bubble, à l'identique.
 *
 * Le droit de la produire est celui de voir la fiche : `fiche_candidat()`
 * (0057) et `commission_du_candidat()` (0067) ne rendent rien pour un candidat
 * hors de mes loges, et changer l'identifiant dans l'adresse n'y change rien.
 *
 * Le document, lui, ne reprend de la fiche que ce qui peut circuler : le
 * numéro, ce que la personne recherche, son rayon d'action — et le QR code de
 * son CV anonyme, s'il existe. Jamais son nom.
 */

export const runtime = 'nodejs';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ erreur: 'Ce dossier n’existe pas.' }, { status: 404 });
  }

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });
    }

    const fiche = await lireFiche(id);
    if (!fiche) {
      return NextResponse.json({ erreur: 'Ce dossier n’existe pas.' }, { status: 404 });
    }

    const octets = await produireLAffichette(await donneesDeLAffichette(id, fiche, origine(requete)));

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': enTeteDeTelechargement(nomDeLAffichette(fiche.numero), 'inline'),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    console.error('[affichette] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'L’affichette n’a pas pu être produite. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
