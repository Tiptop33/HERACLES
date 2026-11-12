import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CODE_A_COCHER, lireListe } from '@/lib/secteurs';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Cocher ou décocher un secteur d'activité pour une loge — le bloc « Secteurs
 * représentés » de la page Référents, où chaque geste s'enregistre aussitôt.
 *
 * La session d'abord. Le droit — le Secrétaire de la loge, ou un
 * administrateur — est vérifié par la base (`cocher_un_secteur`, 0091), qui
 * refuse d'elle-même : cette route traduit ses refus. Elle rend la liste telle
 * que la base l'a retenue, que l'écran affiche à la place de la sienne.
 */

const Demande = z
  .object({
    code: z.string().regex(CODE_A_COCHER, 'Ce secteur ne peut pas être coché.'),
    coche: z.boolean(),
  })
  .strict();

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette loge n’existe pas.' }, { status: 404 });
    }

    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const lu = Demande.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json(
        { erreur: lu.error.issues[0]?.message ?? 'Demande illisible.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc('cocher_un_secteur', {
      la_loge: id,
      le_code: lu.data.code,
      coche: lu.data.coche,
    });
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { erreur: 'Seul le Secrétaire de la loge peut modifier ses secteurs.' },
          { status: 403 },
        );
      }
      // Un niveau refusé (0089) ou un code hors nomenclature.
      if (error.code === '23514' || error.code === '23503') {
        return NextResponse.json({ erreur: 'Ce secteur ne peut pas être coché.' }, { status: 400 });
      }
      return indisponible(error);
    }

    const liste = lireListe(data);
    if (!liste) return indisponible('réponse illisible');
    return NextResponse.json({ liste });
  } catch (souci) {
    return indisponible(souci);
  }
}

function indisponible(souci: unknown) {
  console.error('[secteurs de la loge]', souci);
  return NextResponse.json(
    { erreur: 'Le service est momentanément indisponible. Réessayez dans un instant.' },
    { status: 503 },
  );
}
