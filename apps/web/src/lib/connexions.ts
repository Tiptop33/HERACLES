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

/** Un identifiant de fiche référent, tel que la base les écrit. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le référent demandé par l'adresse (`?referent=…`), ou `null`.
 *
 * Tout ce qui n'a pas la forme d'un identifiant est ignoré : l'adresse se
 * tape à la main, et une valeur de travers doit rendre le tableau entier, pas
 * une erreur de la base.
 */
export function referentDemande(valeur: string | string[] | undefined): string | null {
  const premier = Array.isArray(valeur) ? valeur[0] : valeur;
  return premier && UUID.test(premier) ? premier.toLowerCase() : null;
}

/**
 * Les connexions, les plus récentes d'abord — toutes, ou celles d'un seul
 * référent (migration 0112). Le filtre se fait en base, avant la limite : un
 * référent dont la dernière connexion est ancienne se retrouve quand même.
 */
export async function listerLesConnexions(
  referentId: string | null = null,
): Promise<ConnexionDeReferent[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('les_connexions_des_referents', {
    limite: LIMITE_DES_CONNEXIONS,
    referent: referentId,
  });
  if (error) {
    console.error('[connexions] lecture impossible', error.code);
    return [];
  }
  return (data ?? []) as ConnexionDeReferent[];
}

export type ReferentDuJournal = {
  referent_id: string;
  nom: string | null;
  prenom: string | null;
  loge_nom: string | null;
};

/**
 * Les référents qui ont au moins une connexion au journal, par nom : le menu
 * du filtre. Vide pour qui n'est pas administrateur.
 */
export async function listerLesReferentsDuJournal(): Promise<ReferentDuJournal[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('les_referents_du_journal');
  if (error) {
    console.error('[connexions] menu des référents impossible', error.code);
    return [];
  }
  return (data ?? []) as ReferentDuJournal[];
}
