import { NextResponse } from 'next/server';
import { enPdf, titreDeLAffiche } from '@/lib/documents/archives';
import { archiverLeDocument } from '@/lib/documents/archiver';
import { donneesDeLAffiche } from '@/lib/documents/donnees';
import { produireLAffiche } from '@/lib/documents/produire';
import { enTeteDeTelechargement } from '@/lib/fichiers';
import { origine } from '@/lib/formulaire';
import { lireUneReunion } from '@/lib/reunion';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * L'affiche de la commission, en PDF — celle de Bubble, à l'identique.
 *
 * Même forme que le compte rendu — un `GET`, la base pour seule porte, et un
 * exemplaire rangé à chaque demande, « Affiche du 28-10-2026 » (migration
 * 0069) —, mais un document tout autre : celui-ci **circule**. Il ne
 * porte aucun nom de candidat : le numéro, la date, l'intitulé, et le lien du
 * CV anonyme (migration 0067). Voir `lib/documents/affiche.ts`.
 */

export const runtime = 'nodejs';

export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ erreur: 'Cette réunion n’existe pas.' }, { status: 404 });
  }

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });
    }

    const reunion = await lireUneReunion(id);
    if (!reunion) {
      return NextResponse.json({ erreur: 'Cette réunion n’existe pas.' }, { status: 404 });
    }

    const octets = await produireLAffiche(await donneesDeLAffiche(reunion, origine(requete)));
    const titre = titreDeLAffiche(reunion.tenue_le);

    // La réunion est vérifiée : l'exemplaire peut se ranger.
    await archiverLeDocument({ reunion: reunion.id, sorte: 'affiche', titre, octets });

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': enTeteDeTelechargement(enPdf(titre), 'inline'),
        // L'affiche est faite pour circuler, mais elle se produit depuis une
        // session : aucun cache partagé n'a à la garder pour un autre.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    console.error('[affiche] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'L’affiche n’a pas pu être produite. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
