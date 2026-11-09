import { NextResponse } from 'next/server';
import { enTeteDeTelechargement, extensionDe, typeDeFichier } from '@/lib/fichiers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le CV anonyme d'un dossier, sans compte — l'adresse du QR code de
 * l'affichette et du lien « CV » de l'affiche.
 *
 * C'est la seule porte de l'application ouverte à qui n'est pas connecté, et
 * elle est étroite (migration 0067) :
 *
 *   · le **CV anonyme** seulement — ni le CV nominatif, ni la lettre, ni la
 *     fiche ;
 *   · d'un dossier **en cours** — refermé, le lien ne mène plus nulle part ;
 *   · pour qui détient le **jeton**, tiré au hasard et propre au candidat.
 *
 * L'ordre est celui du projet : `cv_anonyme_public()` vérifie d'abord, sous la
 * clé anonyme ; alors seulement `supabaseAdmin()` lit les octets dans le seau
 * privé, au chemin que la base vient de rendre — jamais à un chemin venu de
 * la requête.
 *
 * Toute réponse négative est la même : un jeton inventé, un dossier refermé et
 * un CV absent ne se distinguent pas de l'extérieur.
 */

export const runtime = 'nodejs';

const JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ce qui s'affiche dans le navigateur sans risque ; le reste se télécharge. */
const AFFICHABLE = /^(application\/pdf|image\/(png|jpeg|webp|gif|avif))$/;

function introuvable() {
  return new NextResponse('Ce CV n’est pas ou plus disponible.', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(_requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  if (!JETON.test(jeton)) return introuvable();

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('cv_anonyme_public', { jeton });
    if (error) {
      console.error('[cv-anonyme] lecture refusée', error.code);
      return introuvable();
    }
    const cv = (data as Array<{ numero: number | null; chemin: string | null }> | null)?.[0];
    if (!cv?.chemin) return introuvable();

    const { data: fichier, error: souci } = await supabaseAdmin().storage.from('documents').download(cv.chemin);
    if (souci || !fichier) return introuvable();

    const type = typeDeFichier(cv.chemin, fichier.type);
    const nom = `CV anonyme${cv.numero ? ` - dossier ${cv.numero}` : ''}${extensionDe(cv.chemin)}`;

    return new NextResponse(await fichier.arrayBuffer(), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': enTeteDeTelechargement(nom, AFFICHABLE.test(type) ? 'inline' : 'attachment'),
        // Le lien circule, le fichier ne doit pas s'installer ailleurs : ni
        // dans un cache partagé, ni dans un moteur de recherche, ni dans
        // l'en-tête « Referer » d'un site ouvert depuis le PDF.
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (souci) {
    console.error('[cv-anonyme] échec inattendu', souci);
    return NextResponse.json({ erreur: 'Le service est momentanément indisponible.' }, { status: 503 });
  }
}
