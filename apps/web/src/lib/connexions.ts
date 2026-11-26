import { supabaseServer } from './supabase-server';

/**
 * Le journal des connexions des référents (migration 0110).
 *
 * Une ligne par présence continue devant l'écran : elle commence à la
 * connexion, se prolonge à chaque signe de vie, et se clôt à la déconnexion ou
 * après trente minutes de silence.
 *
 * Rien n'est filtré ici : `les_connexions_des_referents()` ne rend ses lignes
 * qu'à un administrateur. Toute autre personne obtient une liste vide, même si
 * la page s'affichait par erreur.
 */

export type ConnexionDeReferent = {
  id: string;
  referent_id: string;
  nom: string | null;
  prenom: string | null;
  loge_nom: string | null;
  debut: string;
  fin: string;
  duree_secondes: number;
  /** Un signe de vie de moins de deux minutes, et pas de déconnexion. */
  en_cours: boolean;
};

/** Le nombre de lignes affichées : les plus récentes. */
export const LIMITE_DES_CONNEXIONS = 500;

export async function listerLesConnexions(): Promise<ConnexionDeReferent[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('les_connexions_des_referents', {
    limite: LIMITE_DES_CONNEXIONS,
  });
  if (error) {
    console.error('[connexions] lecture impossible', error.code);
    return [];
  }
  return (data ?? []) as ConnexionDeReferent[];
}
