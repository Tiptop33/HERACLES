import { supabaseServer } from './supabase-server';

/**
 * Les dossiers en cours d'une loge, tels que `dossiers_en_cours()` les rend
 * (migration 0055).
 *
 * Ils alimentent les deux documents de la commission, qui n'en montrent pas la
 * même chose :
 *
 *   · le **compte rendu** les donne avec les noms et le dernier commentaire —
 *     il reste entre les mains de la commission ;
 *   · l'**affiche** les donne sans nom : la date, l'intitulé, le numéro. Elle
 *     circule, et c'est le numéro qui sert à demander la fiche.
 *
 * La distinction tient au document, pas à la requête : la base rend tout à qui
 * appartient à la loge, et chaque document choisit ce qu'il imprime.
 */

export type Dossier = {
  candidat_id: string;
  numero: number | null;
  ouvert_le: string | null;
  /** Court : ce que le métier s'appelle. */
  emploi: string | null;
  /** Long : ce que la personne cherche, tel qu'elle l'a écrit. */
  recherche: string | null;
  nom: string | null;
  prenom: string | null;
  referent_nom: string | null;
  commentaire: string | null;
  a_un_cv: boolean;
};

export async function lireDossiers(reunion: string): Promise<Dossier[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return [];
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('dossiers_en_cours', { reunion_choisie: reunion });
  return (data as Dossier[]) ?? [];
}

/**
 * Les lignes de contact du pied de l'affiche (migration 0056).
 *
 * Vides tant que l'installation ne les a pas posées — ce sont des coordonnées
 * réelles, elles ne sont pas livrées avec l'application. Une affiche sans pied
 * se remarque et se corrige ; une affiche portant celles d'un autre, non.
 */
export async function lireContactsDeLaCommission(): Promise<string[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('parametre')
    .select('commission_contacts')
    .maybeSingle();
  const lignes = (data as { commission_contacts: string[] | null } | null)?.commission_contacts;
  return (lignes ?? []).filter((l) => typeof l === 'string' && l.trim() !== '');
}
