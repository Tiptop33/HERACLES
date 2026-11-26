import { supabaseServer } from './supabase-server';

/**
 * Lecture de l'écran d'administration.
 *
 * Aucune de ces requêtes n'écrit « où le rôle est admin » : c'est la RLS
 * (migration 0010) qui s'en charge. Une personne qui n'est pas administratrice
 * obtient des listes vides, même si la page s'affichait par erreur.
 */

export type InvitationVisible = {
  id: string;
  email: string;
  role: string;
  etat: 'envoyee' | 'acceptee' | 'refusee';
  cree_le: string;
  expire_le: string;
  repondu_le: string | null;
  perimee: boolean;
  loge_nom: string | null;
  loge_id: string | null;
  invite_par_nom: string | null;
};

export type LogeBreve = { id: string; nom: string | null };

export async function listerInvitations(): Promise<InvitationVisible[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('invitation_visible')
    .select('*')
    .order('cree_le', { ascending: false })
    .limit(200);

  return (data ?? []) as InvitationVisible[];
}

export async function listerLoges(): Promise<LogeBreve[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.from('loge').select('id, nom').order('nom');
  return (data ?? []) as LogeBreve[];
}

/** L'état d'une invitation, dit en un mot et une couleur. */
export function etatInvitation(invitation: InvitationVisible): {
  etat: 'suivi' | 'attente' | 'clos';
  libelle: string;
} {
  if (invitation.etat === 'acceptee') return { etat: 'suivi', libelle: 'Acceptée' };
  if (invitation.etat === 'refusee') return { etat: 'clos', libelle: 'Révoquée' };
  if (invitation.perimee) return { etat: 'clos', libelle: 'Périmée' };
  return { etat: 'attente', libelle: 'En attente' };
}

/** Un compte, tel que l'écran Admin › Comptes l'affiche (migration 0109). */
export type CompteVisible = {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  role: string;
  a_une_fiche: boolean;
  loge_id: string | null;
  loge_nom: string | null;
  c_est_moi: boolean;
};

/**
 * Les comptes ouverts, sans ceux des candidats. `lister_comptes` ne rend rien
 * à qui n'est pas administrateur : le contrôle est dans la base, pas ici.
 */
export async function listerComptes(): Promise<CompteVisible[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('lister_comptes');
  return (data ?? []) as CompteVisible[];
}

/**
 * La recherche de l'écran des comptes : nom, prénom ou adresse, sans tenir
 * compte des accents ni des majuscules. Elle range, elle ne protège rien.
 */
export function filtrerComptes(comptes: readonly CompteVisible[], recherche: string): CompteVisible[] {
  const plier = (texte: string) =>
    texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const mots = plier(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [...comptes];
  return comptes.filter((c) => {
    const botte = plier([c.prenom, c.nom, c.email].filter(Boolean).join(' '));
    return mots.every((mot) => botte.includes(mot));
  });
}
