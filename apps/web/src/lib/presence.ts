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

/**
 * À la connexion. Rejouable : tant que la session est vivante, un second onglet
 * ne décale pas l'heure de début ; passé les douze heures du garde-fou, elle en
 * ouvre une neuve (migration 0051).
 *
 * **À appeler partout où une session s'ouvre**, et il y a trois portes :
 *
 *   · `/api/connexion` — le formulaire e-mail et mot de passe ;
 *   · `/auth/callback` — Google, les liens de confirmation, d'invitation et de
 *     réinitialisation : tout ce qui passe par `exchangeCodeForSession` ;
 *   · `/api/invitations/<jeton>` — la session ouverte dans la foulée du choix
 *     du mot de passe.
 *
 * La liste est écrite ici parce que l'oubli ne se voit pas : la personne entre
 * normalement, travaille normalement, et n'apparaît simplement jamais dans la
 * colonne de ses collègues. C'est ce qui est arrivé aux deux dernières.
 */
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
