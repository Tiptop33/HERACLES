import { ChampsDeLaProvince } from '@/lib/provinces';
import { indisponible, ouvrir, refus, repondre, saisieRefusee } from './acces';

/**
 * Ajouter une province — écran Province, réservé à l'administration
 * (migration 0096). L'écusson, s'il est choisi, se dépose ensuite par
 * `/api/provinces/<id>/ecusson` : l'écran a besoin de l'identifiant d'abord.
 */
export async function POST(requete: Request) {
  try {
    const acces = await ouvrir();
    if (!acces.ok) return acces.reponse;

    const lu = ChampsDeLaProvince.safeParse(await requete.json().catch(() => null));
    if (!lu.success) return saisieRefusee(lu.error.issues[0]?.message);

    const { data: id, error } = await acces.supabase.rpc('enregistrer_province', {
      la_province: null,
      le_nom: lu.data.nom_de_la_province,
    });
    if (error) return refus('ajout refusé', error);

    return repondre(acces.supabase, { id });
  } catch (souci) {
    console.error('[provinces] ajout : échec inattendu', souci);
    return indisponible();
  }
}
