import { NextResponse } from 'next/server';
import { lireOffreAModifier, lireOffresEchues, type OffreAModifier, type OffreEchue } from './offres-saisies';
import { supabaseServer } from './supabase-server';

/**
 * Les offres saisies à la main, côté serveur (0114) : ce que les pages lisent,
 * et la façon dont les routes répondent à un refus de la base. Toujours avec
 * la session de la personne : c'est la base qui dit qui peut quoi.
 */

/**
 * L'offre telle que sa fenêtre de modification la remplit — `null` quand la
 * personne connectée ne peut pas la modifier, ou que la base ne répond pas :
 * la fenêtre du détail n'affiche alors aucun geste.
 */
export async function lireOffreAModifierDe(id: string): Promise<OffreAModifier | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('offre_a_modifier', { l_offre: id });
  if (error) return null;
  return lireOffreAModifier(data);
}

/**
 * Les offres saisies sorties de la liste : les siennes pour un référent,
 * toutes pour l'administration. Une liste vide quand la base ne répond pas —
 * le bloc ne s'affiche alors pas, et la liste principale reste.
 */
export async function lireLesOffresEchues(): Promise<OffreEchue[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('offres_saisies_echues');
  if (error) return [];
  return lireOffresEchues(data) ?? [];
}

/**
 * La réponse d'une route à un refus de la base. Un champ refusé (23514) : la
 * base dit lequel, en français, et rien de plus — son message s'affiche tel
 * quel. Le reste ne dit rien de la base.
 */
export function refusDeLaBase(error: { code?: string; message?: string }, autrement: string) {
  if (error.code === '42501') {
    return NextResponse.json(
      { erreur: 'Seuls l’auteur de l’offre et l’administration la modifient.' },
      { status: 403 },
    );
  }
  if (error.code === '23514') {
    // Les messages de `offre_saisie_controlee` sont écrits pour l'écran ; celui
    // d'une contrainte de table nommerait la table : il ne sort pas.
    const message = error.message && !/constraint|violates|relation/i.test(error.message) ? error.message : null;
    return NextResponse.json({ erreur: message ?? 'Un champ de la fiche est refusé.' }, { status: 400 });
  }
  console.error('[offres saisies]', error.code);
  return NextResponse.json({ erreur: autrement }, { status: 503 });
}
