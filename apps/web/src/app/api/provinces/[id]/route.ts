import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ChampsDeLaProvince } from '@/lib/provinces';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { indisponible, ouvrir, refus, repondre, saisieRefusee } from '../acces';

/**
 * Renommer (PATCH) ou retirer (DELETE) une province — écran Province, réservé
 * à l'administration (migration 0096).
 */

const introuvable = () => NextResponse.json({ erreur: 'Cette province n’existe plus.' }, { status: 404 });

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return introuvable();

    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const lu = ChampsDeLaProvince.safeParse(await requete.json().catch(() => null));
    if (!lu.success) return saisieRefusee(lu.error.issues[0]?.message);

    const { error } = await acces.supabase.rpc('enregistrer_province', {
      la_province: id,
      le_nom: lu.data.nom_de_la_province,
    });
    if (error) return refus('renommage refusé', error);

    return repondre(acces.supabase);
  } catch (souci) {
    console.error('[provinces] renommage : échec inattendu', souci);
    return indisponible();
  }
}

/**
 * Retirer une province. Ses loges n'ont plus de province : l'écran l'a dit,
 * chiffres à l'appui, avant de demander. L'ordre :
 *
 *   1. la session, puis le droit — `ouvrir()` : l'administration seule ;
 *   2. la base retire, et redit le droit (`retirer_province`) ;
 *   3. alors seulement `supabaseAdmin()`, pour effacer l'écusson du seau —
 *      SQL n'atteint pas le stockage. Un fichier qui résiste ne fait pas
 *      échouer le retrait : la province n'existe déjà plus.
 */
export async function DELETE(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return introuvable();

    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const { data: ecusson, error } = await acces.supabase.rpc('retirer_province', { la_province: id });
    if (error) return refus('retrait refusé', error);

    if (typeof ecusson === 'string' && ecusson) {
      const { error: souciMenage } = await supabaseAdmin().storage.from('documents').remove([ecusson]);
      if (souciMenage) console.error('[provinces] écusson d’une province retirée non effacé', souciMenage);
    }

    return repondre(acces.supabase);
  } catch (souci) {
    console.error('[provinces] retrait : échec inattendu', souci);
    return indisponible();
  }
}
