import { supabaseServer } from './supabase-server';

/**
 * Qui est là (migrations 0042 et 0057).
 *
 * « Là » veut dire ici : une session ouverte, **et** un signe de vie de moins
 * de deux minutes. La session seule ne suffit pas — on ferme un onglet, on ne
 * se déconnecte pas, et la colonne montrerait des gens partis depuis des
 * heures.
 *
 * Le signe de vie ne coûte aucune requête de plus : c'est le rafraîchissement
 * de la colonne lui-même, toutes les trente secondes tant que l'onglet est
 * visible. Demander qui est là, c'est être devant l'écran.
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
 * Le signe de vie (migration 0057). Posé au passage de `/api/connectes`, que
 * la colonne redemande toutes les trente secondes tant que l'onglet est
 * visible.
 *
 * Sans effet sur une session close : un onglet resté ouvert dans un coin après
 * un « Se déconnecter » redemande la liste, mais ne remet personne dedans.
 */
export async function jeSuisLa(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.rpc('je_suis_la');
}

/**
 * À la connexion. Rejouable : tant que la session est vivante, un second onglet
 * ne décale pas l'heure de début ; passé les douze heures du garde-fou, elle en
 * ouvre une neuve (migration 0051).
 *
 * Cette heure-là dit **quand la session a commencé** — elle range la colonne,
 * le dernier arrivé en tête. Ce n'est pas elle qui décide qui s'y trouve : ça,
 * c'est le signe de vie (0057).
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
 *
 * Elle efface l'ouverture de session et le dernier signe de vie : on sort de
 * la colonne tout de suite, sans attendre les deux minutes.
 */
export async function jeMeDeconnecte(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.rpc('je_me_deconnecte');
}
