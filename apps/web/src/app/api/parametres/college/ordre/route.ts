import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Ranger la liste du collège d'un seul geste.
 *
 * Cette route-ci n'a pas de version « formulaire natif », et c'est assumé :
 * elle ne sert que la poignée qu'on tire, qui suppose déjà JavaScript. Sans
 * lui, les flèches ↑ ↓ restent, et elles passent par l'autre route.
 *
 * L'ordre entier est envoyé, pas un déplacement. `ranger_college` (migration
 * 0018) refuse un ordre incomplet, dupliqué ou étranger à la liste : deux
 * personnes peuvent la ranger en même temps, et un rangement faux ne se voit
 * pas.
 */

const Corps = z.object({
  ordre: z.array(z.uuid()).min(1, 'Un ordre vide ne range rien.').max(200),
});

export async function POST(requete: Request) {
  try {
    const lu = Corps.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json(
        { erreur: lu.error.issues[0]?.message ?? 'Ordre invalide.' },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const { error } = await supabase.rpc('ranger_college', { ordre: lu.data.ordre });

    if (error) {
      if (error.code === '42501') {
        return NextResponse.json(
          { erreur: 'Seul un administrateur peut ranger cette liste.' },
          { status: 403 },
        );
      }
      // 22023 : l'ordre ne correspond plus à la liste. Quelqu'un d'autre l'a
      // modifiée entre-temps — le dire, plutôt que de ranger de travers.
      if (error.code === '22023') {
        return NextResponse.json(
          { erreur: 'La liste a changé entre-temps. Rechargez la page.' },
          { status: 409 },
        );
      }
      console.error('[college] rangement refusé', error);
      return NextResponse.json({ erreur: "La liste n'a pas pu être rangée." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (souci) {
    console.error('[college] échec inattendu', souci);
    return NextResponse.json(
      { erreur: 'Le service est momentanément indisponible.' },
      { status: 503 },
    );
  }
}
