import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';

/**
 * Les invitations : la seule porte d'entrée de HERACLES.
 *
 * Le jeton voyage dans le lien envoyé par email ; la base n'en garde que
 * l'empreinte. Qui lirait la table n'y trouverait pas de quoi fabriquer un lien
 * valable — c'est la raison qui fait qu'on ne stocke pas non plus les mots de
 * passe.
 */

/** 32 octets tirés au sort, en base64url : impossible à deviner. */
export function fabriquerJeton(): string {
  return randomBytes(32).toString('base64url');
}

export function empreinte(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex');
}

export type Invitation = {
  id: string;
  email: string;
  role: string;
  loge_nom: string | null;
  invite_par_nom: string | null;
  valable: boolean;
  motif: 'deja_acceptee' | 'revoquee' | 'expiree' | null;
};

/**
 * L'invitation que désigne ce jeton, ou `null`.
 *
 * Passe par la clé service_role : la table est fermée à tout le monde, et la
 * personne invitée n'a par définition pas encore de droits. Le jeton **est**
 * son droit — c'est pour cela qu'il doit rester secret et qu'il expire.
 */
export async function lireInvitation(jeton: string): Promise<Invitation | null> {
  if (!jeton || jeton.length < 20) return null;

  const { data, error } = await supabaseAdmin().rpc('invitation_par_empreinte', {
    empreinte: empreinte(jeton),
  });

  if (error || !data || data.length === 0) return null;
  return data[0] as Invitation;
}

/** Le libellé d'un rôle, tel que l'écran d'invitation l'annonce. */
export function libelleRoleInvitation(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrateur';
    case 'chercheur':
      return 'Candidat';
    default:
      return 'Référent';
  }
}
