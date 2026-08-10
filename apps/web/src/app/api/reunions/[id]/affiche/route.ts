import { NextResponse } from 'next/server';
import { construireAffiche, nomDeLAffiche } from '@/lib/affiche';
import { referentCourant } from '@/lib/candidat';
import { lireContactsDeLaCommission, lireDossiers } from '@/lib/dossiers';
import { lireUneReunion } from '@/lib/reunion';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * L'affiche de la commission, en PDF.
 *
 * Même forme que le compte rendu — une lecture, donc un `GET`, et la base pour
 * seule porte —, mais un document tout autre : celui-ci **circule**. Il ne
 * porte aucun nom de candidat, seulement des numéros de dossier. Voir
 * `lib/affiche.ts`.
 */

export const runtime = 'nodejs';

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const [dossiers, contacts, moi] = await Promise.all([
      lireDossiers(id),
      lireContactsDeLaCommission(),
      referentCourant(),
    ]);

    const octets = await construireAffiche({
      tenueLe: reunion.tenue_le,
      loge: moi?.loge ?? null,
      dossiers,
      contacts,
    });

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomDeLAffiche(reunion.tenue_le)}"`,
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
