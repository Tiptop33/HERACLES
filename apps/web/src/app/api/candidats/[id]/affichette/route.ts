import { NextResponse } from 'next/server';
import { construireAffichette, nomDeLAffichette } from '@/lib/affichette';
import { lireContactsDeLaCommission } from '@/lib/dossiers';
import { lireFiche } from '@/lib/poste';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * L'affichette d'un dossier, en PDF.
 *
 * Le droit de voir cette fiche est celui de `fiche_candidat()` (0020) : elle ne
 * rend rien pour un candidat hors de mes loges, et changer l'identifiant dans
 * l'adresse n'y change rien. Cette route ne filtre donc pas elle-même — elle
 * n'aurait aucun moyen de mieux faire.
 *
 * Le document, lui, ne reprend qu'une poignée de champs de cette fiche : ce que
 * la personne cherche, et son numéro. Voir `lib/affichette.ts` — c'est le
 * document le plus exposé des trois.
 */

export const runtime = 'nodejs';

export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const contacts = await lireContactsDeLaCommission();

    const octets = await construireAffichette({
      dossier: {
        numero: fiche.numero,
        type_emploi: fiche.type_emploi,
        emploi_recherche: fiche.emploi_recherche,
        metier_libelle: fiche.metier_libelle,
        secteur_activite_libelle: fiche.secteur_activite_libelle,
        mobilite_geographique: fiche.mobilite_geographique,
      },
      contacts,
    });

    return new NextResponse(octets as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomDeLAffichette(fiche.numero)}"`,
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
