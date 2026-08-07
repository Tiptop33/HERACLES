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
