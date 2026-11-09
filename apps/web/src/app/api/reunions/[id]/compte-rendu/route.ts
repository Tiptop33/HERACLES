import { NextResponse } from 'next/server';
import { nomDuCompteRendu } from '@/lib/documents/compte-rendu';
import { donneesDuCompteRendu } from '@/lib/documents/donnees';
import { produireLeCompteRendu } from '@/lib/documents/produire';
import { enTeteDeTelechargement } from '@/lib/fichiers';
import { lireUneReunion } from '@/lib/reunion';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le compte rendu d'une réunion, en PDF — celui de Bubble, à l'identique, mis
 * en page selon Paramètres › Mise en page.
 *
 * Une lecture, donc un `GET` : le document est une photographie de ce que la
 * base sait déjà, rien ne s'écrit en le demandant.
 *
 * L'ordre imposé par le projet est tenu par la base : `lireUneReunion()` et les
 * fonctions de 0055 et 0067 ne rendent rien hors de la loge de la personne
 * connectée. Cette route ne filtre rien elle-même, et ne touche pas à
 * `supabaseAdmin()`.
 *
 * `runtime = 'nodejs'` : pdfmake lit ses polices sur le disque et travaille sur
 * des tampons — rien qui doive tourner en bordure.
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

    const octets = await produireLeCompteRendu(await donneesDuCompteRendu(reunion));

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        // `inline` : le navigateur l'ouvre dans son lecteur, on le relit avant
        // de l'envoyer. Le nom reste posé, pour l'enregistrement.
        'Content-Disposition': enTeteDeTelechargement(nomDuCompteRendu(reunion.tenue_le), 'inline'),
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
