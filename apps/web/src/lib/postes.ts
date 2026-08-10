import { supabaseServer } from './supabase-server';

/**
 * Les postes à pourvoir remontés à la commission (migration 0057).
 *
 * L'autre moitié de l'affiche : d'un côté ceux qui cherchent, de l'autre ce
 * qu'il y a à prendre. Ils ne viennent pas de France Travail — `offre_emploi`
 * n'appartient à aucune loge et ne porte personne à qui écrire. Un poste
 * d'ici est une information rapportée par quelqu'un, avec le nom de la
 * personne à joindre.
 *
 * C'est le seul endroit de l'affiche où paraissent des coordonnées : celles
 * d'un recruteur, pas d'un candidat.
 */

export type Poste = {
  id: string;
  intitule: string;
  societe: string | null;
  ville: string | null;
  contact: string | null;
  email: string | null;
  remonte_le: string | null;
};

export async function lirePostes(reunion: string): Promise<Poste[]> {
  if (!/^[0-9a-f-]{36}$/i.test(reunion)) return [];
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('postes_a_pourvoir', { reunion_choisie: reunion });
  return (data as Poste[]) ?? [];
}

/** La liste de l'écran : les postes de ma loge, sans passer par une réunion. */
export async function lireMesPostes(): Promise<Poste[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('mes_postes_a_pourvoir');
  return (data as Poste[]) ?? [];
}

/**
 * Ce que les routes des postes répondent quand elles refusent. Comme partout
 * ici, l'adresse ne porte qu'un code : un message porté par l'URL est un
 * message qu'un lien fabriqué peut faire dire ce qu'il veut.
 */
const REFUS: Record<string, string> = {
  'sans-loge': 'Votre compte n\u2019est rattaché à aucune loge : vous ne notez aucun poste.',
  intitule: 'Un poste à pourvoir a besoin d\u2019un intitulé.',
  long: 'Cet intitulé est trop long.',
  introuvable: 'Ce poste n\u2019existe pas, ou il n\u2019est pas de votre loge.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'Le poste n\u2019a pas pu être enregistré.',
};

export function phraseDeRefusPoste(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS[code] ?? 'Le poste n\u2019a pas pu être enregistré.';
}
