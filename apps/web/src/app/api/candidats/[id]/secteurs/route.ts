import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CODE_DE_CANDIDAT, SECTEURS_PAR_CANDIDAT, lireSecteursDuCandidat } from '@/lib/secteurs';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Poser la liste des secteurs d'un candidat, depuis sa fiche — chaque geste
 * s'enregistre aussitôt (décision 13). La session d'abord ; le droit est dans
 * la base : son référent et son parrain (`ecrire_les_secteurs_du_candidat`,
 * 0092). La route rend la liste telle que la base l'a retenue.
 */

const Demande = z
  .object({
    codes: z
      .array(z.string().regex(CODE_DE_CANDIDAT, 'Ce secteur ne peut pas être choisi.'))
      .max(SECTEURS_PAR_CANDIDAT, 'Trois secteurs au plus.')
      .refine((codes) => new Set(codes).size === codes.length, 'Le même secteur ne se cite pas deux fois.'),
  })
  .strict();

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if (!lu.success) {
      return NextResponse.json({ erreur: lu.error.issues[0]?.message ?? 'Demande illisible.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('ecrire_les_secteurs_du_candidat', {
      le_candidat: id,
      codes: lu.data.codes,
    });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { erreur: 'Seuls le référent et le parrain du candidat modifient ses secteurs.' },
          { status: 403 },
        );
      }
      if (error.code === '23514' || error.code === '23503') {
        return NextResponse.json({ erreur: 'Ce secteur ne peut pas être choisi.' }, { status: 400 });
      }
      console.error('[secteurs du candidat] écriture', error.code);
      return NextResponse.json({ erreur: 'L’enregistrement a échoué. Réessayez.' }, { status: 503 });
    }
    const secteurs = lireSecteursDuCandidat(data);
    if (!secteurs) return NextResponse.json({ erreur: 'L’enregistrement a échoué. Réessayez.' }, { status: 503 });
    return NextResponse.json({ secteurs: secteurs.secteurs, repris_de_bubble: secteurs.repris_de_bubble });
  } catch (souci) {
    console.error('[secteurs du candidat] écriture : échec inattendu', souci);
    return NextResponse.json({ erreur: 'L’enregistrement a échoué. Réessayez.' }, { status: 503 });
  }
}
