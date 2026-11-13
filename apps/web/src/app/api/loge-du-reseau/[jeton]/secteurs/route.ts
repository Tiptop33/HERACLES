import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CODE_A_COCHER, lireListe } from '@/lib/secteurs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { empreinteDuLien, indisponible, refus } from '../commun';

/**
 * Cocher ou décocher un secteur, par le lien du Secrétaire d'une loge du
 * réseau. Chaque case s'enregistre aussitôt ; la route rend la liste telle que
 * la base l'a retenue (`cocher_par_le_lien`, 0091).
 */

const Demande = z
  .object({
    code: z.string().regex(CODE_A_COCHER, 'Ce secteur ne peut pas être coché.'),
    coche: z.boolean(),
  })
  .strict();

export async function PATCH(requete: Request, { params }: { params: Promise<{ jeton: string }> }) {
  try {
    const lien = empreinteDuLien((await params).jeton);
    if (!lien.ok) return lien.reponse;

    const lu = Demande.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json({ erreur: lu.error.issues[0]?.message ?? 'Demande illisible.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('cocher_par_le_lien', {
      empreinte: lien.empreinte,
      le_code: lu.data.code,
      coche: lu.data.coche,
    });
    if (error) {
      // Un niveau refusé (0089) ou un code hors nomenclature.
      if (error.code === '23514' || error.code === '23503') {
        return NextResponse.json({ erreur: 'Ce secteur ne peut pas être coché.' }, { status: 400 });
      }
      return refus('cocher', error);
    }

    const liste = lireListe(data);
    if (!liste) return indisponible();
    return NextResponse.json({ liste });
  } catch (souci) {
    console.error('[loge du réseau] cocher : échec inattendu', souci);
    return indisponible();
  }
}
