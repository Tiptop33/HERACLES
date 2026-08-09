import { supabaseServer } from './supabase-server';

/**
 * Qui est là (migration 0042).
 *
 * « Connecté » veut dire ici : la session est ouverte. Elle l'est de la
 * connexion à la déconnexion, avec un garde-fou de douze heures posé en base —
 * on ferme un onglet, on ne se déconnecte pas.
 *
 * La liste ne sort jamais de la loge : `les_connectes()` filtre dessus, et
 * c'est la fonction qui décide, pas l'écran.
 */

export type Connecte = {
  referent_id: string;
  nom: string | null;
  prenom: string | null;
  /** Servie par /espace/referents/<id>/photo, comme dans l'annuaire. */
  a_une_photo: boolean;
};

export async function lireLesConnectes(): Promise<Connecte[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('les_connectes');
  return (data as Connecte[]) ?? [];
}

/** À la connexion. Rejouable : un second onglet ne décale pas l'heure. */
export async function jeMeConnecte(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.rpc('je_me_connecte');
}

/**
 * À la déconnexion — **avant** `signOut()`, tant que la session vaut encore :
 * après, la fonction ne saurait plus quelle ligne effacer.
 */
export async function jeMeDeconnecte(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.rpc('je_me_deconnecte');
}
