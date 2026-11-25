import { NextResponse } from 'next/server';
import { estCleModifiable, validerUnChamp } from '@/lib/page-candidat';
import { exigerMonDossier, lireJson, refus, refusDeLaBase } from '../commun';

/**
 * Enregistrer un champ de sa fiche, aussitôt quitté (0105). Un champ à la
 * fois : ce qui part est ce que la personne vient de changer, rien d'autre.
 */
export async function POST(requete: Request) {
  const session = await exigerMonDossier();
  if (session instanceof NextResponse) return session;

  const corps = await lireJson(requete);
  const champ = corps?.champ;
  if (!estCleModifiable(champ)) return refus(400, 'Ce champ ne se modifie pas ici.');

  const verdict = validerUnChamp(champ, corps?.valeur);
  if (!verdict.ok) return refus(400, verdict.message, champ);

  const { error } = await session.supabase.rpc('modifier_ma_fiche_de_candidat', {
    champ,
    valeur: verdict.valeur,
  });
  if (error) {
    // La base vérifie aussi l'ordre des dates du stage.
    if (error.code === '23514' && (champ === 'debut_stage' || champ === 'fin_stage')) {
      return refus(400, 'La fin du stage précède son début.', champ);
    }
    return refusDeLaBase(error.code, 'fiche refusée', champ);
  }

  return NextResponse.json({ ok: true, valeur: verdict.valeur });
}
