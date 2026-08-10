import { NextResponse } from 'next/server';
import {
  construireCompteRendu,
  lireCandidats,
  lirePresences,
  nomDuFichier,
} from '@/lib/compte-rendu';
import { referentCourant } from '@/lib/candidat';
import { lireUneReunion } from '@/lib/reunion';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le compte rendu d'une réunion, en PDF.
 *
 * Une lecture, donc un `GET` : le document est une photographie de ce que la
 * base sait déjà, rien ne s'écrit en le demandant. On peut le rafraîchir, le
 * mettre en favori, revenir en arrière — sans conséquence.
 *
 * L'ordre imposé par le projet est tenu par la base, comme pour la feuille
 * d'appel : `lireUneReunion()` et les deux fonctions de 0055 ne rendent rien
 * hors de la loge de la personne connectée. Cette route ne filtre rien
 * elle-même, et n'a aucune raison de toucher à `supabaseAdmin()`.
 *
 * `runtime = 'nodejs'` : `pdf-lib` compresse avec `pako` et travaille sur des
 * tampons — rien qui doive tourner en bordure.
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

    // Une réunion d'une autre loge est introuvable, pas interdite : la
    // distinction apprendrait à qui tâtonne ce qui existe ailleurs.
    const reunion = await lireUneReunion(id);
    if (!reunion) {
      return NextResponse.json({ erreur: 'Cette réunion n’existe pas.' }, { status: 404 });
    }

    // La loge, pour l'en-tête. Celle de la personne connectée est celle de la
    // réunion : `lireUneReunion()` n'aurait rien rendu autrement.
    const [presences, candidats, moi] = await Promise.all([
      lirePresences(id),
      lireCandidats(id),
      referentCourant(),
    ]);

    const octets = await construireCompteRendu({
      tenueLe: reunion.tenue_le,
      lieu: reunion.lieu,
      loge: moi?.loge ?? null,
      presences,
      candidats,
    });

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        // `inline` : le navigateur l'ouvre dans son lecteur, on le relit avant
        // de l'envoyer. Le nom reste posé, pour l'enregistrement.
        'Content-Disposition': `inline; filename="${nomDuFichier(reunion.tenue_le)}"`,
        // Le document porte des coordonnées et des situations personnelles :
        // aucun cache partagé n'a à le garder.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    console.error('[compte-rendu] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le compte rendu n’a pas pu être produit. Réessayez dans un instant.' },
      { status: 503 },
    );
  }
}
