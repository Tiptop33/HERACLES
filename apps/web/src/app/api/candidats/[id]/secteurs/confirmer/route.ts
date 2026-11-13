import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CODE_DE_CANDIDAT, lireSecteursDuCandidat } from '@/lib/secteurs';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Confirmer un secteur proposé par le candidat, depuis sa fiche. La session
 * d'abord ; le droit est dans la base : son référent et son parrain
 * (`confirmer_un_secteur_du_candidat`, 0092).
 */

const Demande = z.object({ code: z.string().regex(CODE_DE_CANDIDAT, 'Secteur inconnu.') }).strict();

export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette fiche n’existe plus.' }, { status: 404 });
    }
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const lu = Demande.safeParse(await requete.json().catch(() => null));
    if (!lu.success) return NextResponse.json({ erreur: 'Demande illisible.' }, { status: 400 });

    const { data, error } = await supabase.rpc('confirmer_un_secteur_du_candidat', {
      le_candidat: id,
      le_code: lu.data.code,
    });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { erreur: 'Seuls le référent et le parrain du candidat confirment ses secteurs.' },
          { status: 403 },
        );
      }
      console.error('[secteurs du candidat] confirmation', error.code);
      return NextResponse.json({ erreur: 'La confirmation a échoué. Réessayez.' }, { status: 503 });
    }
    const secteurs = lireSecteursDuCandidat(data);
    if (!secteurs) return NextResponse.json({ erreur: 'La confirmation a échoué. Réessayez.' }, { status: 503 });
    return NextResponse.json({ secteurs: secteurs.secteurs, repris_de_bubble: secteurs.repris_de_bubble });
  } catch (souci) {
    console.error('[secteurs du candidat] confirmation : échec inattendu', souci);
    return NextResponse.json({ erreur: 'La confirmation a échoué. Réessayez.' }, { status: 503 });
  }
}
