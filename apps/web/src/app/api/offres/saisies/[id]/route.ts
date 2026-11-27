import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FicheDOffre, premiereErreurDeLaFiche } from '@/lib/offres-saisies';
import { refusDeLaBase } from '@/lib/offres-saisies-serveur';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Modifier ou retirer une offre saisie à la main (0114). La session d'abord ;
 * le droit est dans la base : son auteur et l'administration
 * (`modifier_une_offre`, `retirer_une_offre`). Une offre de France Travail ne
 * se modifie jamais ici.
 */

async function session() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const introuvable = () => NextResponse.json({ erreur: 'Cette offre n’existe plus.' }, { status: 404 });

/** Toute la fiche, telle qu'elle est à l'écran : un champ vide s'efface. */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return introuvable();
    const { supabase, user } = await session();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const lu = FicheDOffre.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json({ erreur: premiereErreurDeLaFiche(lu.error) }, { status: 400 });
    }

    const { error } = await supabase.rpc('modifier_une_offre', { l_offre: id, les_champs: lu.data });
    if (error) return refusDeLaBase(error, 'La modification n’a pas pu être enregistrée. Réessayez.');
    return NextResponse.json({ ok: true });
  } catch (souci) {
    console.error('[offres saisies] modification : échec inattendu', souci);
    return NextResponse.json({ erreur: 'La modification n’a pas pu être enregistrée. Réessayez.' }, { status: 503 });
  }
}

/** Retirer, c'est supprimer : l'offre n'est plus à pourvoir. */
export async function DELETE(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return introuvable();
    const { supabase, user } = await session();
    if (!user) return NextResponse.json({ erreur: 'Session expirée.' }, { status: 401 });

    const { error } = await supabase.rpc('retirer_une_offre', { l_offre: id });
    if (error) return refusDeLaBase(error, 'L’offre n’a pas pu être retirée. Réessayez.');
    return NextResponse.json({ ok: true });
  } catch (souci) {
    console.error('[offres saisies] retrait : échec inattendu', souci);
    return NextResponse.json({ erreur: 'L’offre n’a pas pu être retirée. Réessayez.' }, { status: 503 });
  }
}
