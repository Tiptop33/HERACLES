import { NextResponse } from 'next/server';
import { ChampsDeLaLoge, indisponible, lister, ouvrir, refus } from './acces';

/**
 * Ajouter une loge du réseau — Paramètres › Loges du réseau. Le lien ne part
 * pas tout seul (maquette validée) : l'administration l'envoie quand la fiche
 * est complète.
 */
export async function POST(requete: Request) {
  try {
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const lu = ChampsDeLaLoge.safeParse(await requete.json().catch(() => null));
    if (!lu.success) {
      return NextResponse.json({ erreur: lu.error.issues[0]?.message ?? 'Demande illisible.' }, { status: 400 });
    }

    const { error } = await acces.supabase.rpc('enregistrer_loge_du_reseau', {
      la_loge: null,
      le_nom: lu.data.nom,
      le_numero: lu.data.numero,
      la_province: lu.data.province_id,
      le_secretaire: lu.data.secretaire_nom,
      l_adresse: lu.data.secretaire_email,
    });
    if (error) return refus('ajout', error);

    const loges = await lister(acces.supabase);
    return loges ? NextResponse.json({ loges }) : indisponible();
  } catch (souci) {
    console.error('[loges du réseau] ajout : échec inattendu', souci);
    return indisponible();
  }
}
