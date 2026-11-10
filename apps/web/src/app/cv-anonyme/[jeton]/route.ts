import { NextResponse } from 'next/server';
import { estUneCopieFigee, lireLaCopieFigee } from '@/lib/documents/copie-figee';
import { donneesDuCvAnonyme, nomDuCvAnonyme, type SourceDuCvAnonyme } from '@/lib/documents/cv-anonyme';
import { produireLeCvAnonymePublic } from '@/lib/documents/produire';
import { enTeteDeTelechargement, extensionDe, typeDeFichier } from '@/lib/fichiers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Le CV anonyme d'un dossier, sans compte — l'adresse du QR code de
 * l'affichette et du lien « CV » de l'affiche.
 *
 * Deux sources, dans cet ordre (migration 0073) :
 *
 *   1. le CV **produit par HERACLES** depuis la fiche, s'il a été validé par
 *      un référent de la loge : la **copie figée** à la validation
 *      (migration 0075), exactement ce qui a été relu ; à défaut — copie
 *      manquante, CV validé avant 0075 —, le PDF se fait ici, à la demande,
 *      des seuls champs anonymes que `cv_anonyme_valide_public()` rend ;
 *   2. à défaut, le **fichier** repris de Bubble ou déposé à la main, comme
 *      avant.
 *
 * C'est la seule porte de l'application ouverte à qui n'est pas connecté, et
 * elle est étroite (migration 0067) :
 *
 *   · le **CV anonyme** seulement — ni le CV nominatif, ni la lettre, ni la
 *     fiche ;
 *   · d'un dossier **en cours** — refermé, le lien ne mène plus nulle part ;
 *   · pour qui détient le **jeton**, tiré au hasard et propre au candidat.
 *
 * L'ordre est celui du projet : `cv_anonyme_valide_public()` ou
 * `cv_anonyme_public()` vérifie d'abord, sous la clé anonyme ; alors seulement
 * `supabaseAdmin()` lit les octets dans le seau privé, au chemin que la base
 * vient de rendre — jamais à un chemin venu de la requête.
 *
 * Toute réponse négative est la même : un jeton inventé, un dossier refermé et
 * un CV absent ne se distinguent pas de l'extérieur.
 */

export const runtime = 'nodejs';

const JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les en-têtes de toute réponse qui porte un CV. */
const PROTECTIONS = {
  // Le lien circule, le fichier ne doit pas s'installer ailleurs : ni
  // dans un cache partagé, ni dans un moteur de recherche, ni dans
  // l'en-tête « Referer » d'un site ouvert depuis le PDF.
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

type CvValide = SourceDuCvAnonyme & {
  valide_le: string | null;
  reglages: unknown;
  /** La copie figée de cette validation-ci, ou null (0075). */
  fige_chemin: string | null;
  /** Le contact par défaut : l'adresse du Secrétaire de la loge (0076). */
  secretaire_email: string | null;
};

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

    // 1. Le CV validé : sa copie figée, sinon produit à la demande.
    const { data: valide, error: refus } = await supabase.rpc('cv_anonyme_valide_public', { jeton });
    if (refus) {
      console.error('[cv-anonyme] lecture refusée', refus.code);
      return introuvable();
    }
    const produit = (valide as CvValide[] | null)?.[0];
    if (produit) {
      const figee = estUneCopieFigee(produit.fige_chemin) ? await lireLaCopieFigee(produit.fige_chemin) : null;
      const octets =
        figee ??
        ((await produireLeCvAnonymePublic(
          donneesDuCvAnonyme(produit, produit.valide_le, produit.secretaire_email),
          produit.reglages,
        )) as unknown as BodyInit);
      return new NextResponse(octets, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': enTeteDeTelechargement(nomDuCvAnonyme(produit.numero), 'inline'),
          ...PROTECTIONS,
        },
      });
    }

    // 2. Le fichier déposé.
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
        ...PROTECTIONS,
      },
    });
  } catch (souci) {
    console.error('[cv-anonyme] échec inattendu', souci);
    return NextResponse.json({ erreur: 'Le service est momentanément indisponible.' }, { status: 503 });
  }
}
