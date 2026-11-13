import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ChampsDeLaLoge, indisponible, lister, ouvrir, refus } from '../acces';

/**
 * Corriger (PATCH) ou retirer (DELETE) une loge du réseau — Paramètres ›
 * Loges du réseau. Chaque correction s'enregistre aussitôt ; changer
 * l'adresse du Secrétaire n'envoie rien. Retirer la loge emporte ses
 * secteurs (0089) et son écusson.
 */

type Parametres = { params: Promise<{ id: string }> };

export async function PATCH(requete: Request, { params }: Parametres) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette loge du réseau n’existe plus.' }, { status: 404 });
    }
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const lu = ChampsDeLaLoge.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json({ erreur: lu.error.issues[0]?.message ?? 'Demande illisible.' }, { status: 400 });
    }

    const { error } = await acces.supabase.rpc('enregistrer_loge_du_reseau', {
      la_loge: id,
      le_nom: lu.data.nom,
      le_numero: lu.data.numero,
      la_province: lu.data.province_id,
      le_secretaire: lu.data.secretaire_nom,
      l_adresse: lu.data.secretaire_email,
    });
    if (error) return refus('correction', error);

    const loges = await lister(acces.supabase);
    return loges ? NextResponse.json({ loges }) : indisponible();
  } catch (souci) {
    console.error('[loges du réseau] correction : échec inattendu', souci);
    return indisponible();
  }
}

export async function DELETE(_requete: Request, { params }: Parametres) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ erreur: 'Cette loge du réseau n’existe plus.' }, { status: 404 });
    }
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const { data: ecusson, error } = await acces.supabase.rpc('retirer_loge_du_reseau', { la_loge: id });
    if (error) return refus('retrait', error);

    // L'écusson quitte le seau avec la loge. Un orphelin n'empêche pas de dire
    // que la loge est retirée : elle l'est.
    if (typeof ecusson === 'string') {
      const { error: souciMenage } = await supabaseAdmin().storage.from('documents').remove([ecusson]);
      if (souciMenage) console.error('[loges du réseau] écusson non effacé', souciMenage);
    }

    const loges = await lister(acces.supabase);
    return loges ? NextResponse.json({ loges }) : indisponible();
  } catch (souci) {
    console.error('[loges du réseau] retrait : échec inattendu', souci);
    return indisponible();
  }
}
