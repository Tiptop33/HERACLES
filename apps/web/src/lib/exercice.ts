import { supabaseServer } from './supabase-server';

/**
 * Les deux bornes de l'exercice (migration 0044).
 *
 * Elles commandent tout ce qui se compte sur l'écran « Réunion » : quelles
 * réunions entrent au registre, et l'assiduité affichée sous chaque nom à
 * l'appel. Une fin dépassée ne casse rien — elle met tous les compteurs à
 * zéro, silencieusement. C'est ce qui s'est produit après le 31 juillet 2026.
 */

export type Exercice = { debut: string | null; fin: string | null };

export async function lireLExercice(): Promise<Exercice> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('l_exercice');
  const lu = ((data as Exercice[]) ?? [])[0];
  return { debut: lu?.debut ?? null, fin: lu?.fin ?? null };
}

/**
 * Où en est-on de l'exercice, vu d'aujourd'hui.
 *
 * Le dire à l'écran plutôt que de laisser l'administrateur déduire d'un
 * intervalle de dates que ses compteurs sont à zéro depuis six semaines.
 */
export type EtatExercice = 'en-cours' | 'termine' | 'a-venir' | 'inconnu';

export function ouEnEstLExercice(exercice: Exercice, aujourdhui: string): EtatExercice {
  if (!exercice.debut || !exercice.fin) return 'inconnu';
  if (aujourdhui < exercice.debut) return 'a-venir';
  if (aujourdhui > exercice.fin) return 'termine';
  return 'en-cours';
}

/** Ce que la route de réglage renvoie, dit à qui a cliqué. */
const REFUS: Record<string, string> = {
  ordre: 'La fin de l’exercice doit venir après son début.',
  date: 'Ces dates ne se lisent pas.',
  droit: 'Seul un administrateur règle les dates d’exercice.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'Les dates n’ont pas pu être enregistrées.',
};

export function phraseDeRefusExercice(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS[code] ?? 'Les dates n’ont pas pu être enregistrées.';
}
