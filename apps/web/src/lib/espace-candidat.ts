import { z } from 'zod';

/**
 * L'espace candidat (docs/specs/2026-11-07-espace-candidat.md) : ce qui se
 * valide et se décide sans base ni réseau, donc ce qui s'éprouve en test.
 */

// ————————————————————————————————————————————————————————————————————————————
// Le bouton « Nouveau candidat » de l'administrateur
// ————————————————————————————————————————————————————————————————————————————

const obligatoire = (max: number, message: string) =>
  z.string({ error: message }).trim().min(1, message).max(max, 'Ce champ est trop long.');

const courriel = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(320, 'Cette adresse est trop longue.')
    .pipe(z.email('Cette adresse e-mail n’est pas valide.'));

/**
 * La fenêtre de l'administrateur : l'adresse du candidat, son parrain, et la
 * loge qui recevra le dossier. Tous obligatoires — la base les exige aussi
 * (`inviter_un_candidat`, migration 0060), mais c'est ici qu'on dit lequel
 * manque.
 */
export const InvitationCandidat = z.object({
  email: courriel('Indiquez l’adresse e-mail du candidat.'),
  parrain_nom: obligatoire(120, 'Indiquez le nom du parrain.'),
  parrain_prenom: obligatoire(120, 'Indiquez le prénom du parrain.'),
  parrain_loge: obligatoire(40, 'Indiquez le numéro de loge du parrain.'),
  parrain_email: courriel('Indiquez l’adresse e-mail du parrain.'),
  loge_id: z.uuid({ error: 'Choisissez la loge du dossier.' }),
});

export type InvitationDeCandidat = z.infer<typeof InvitationCandidat>;

/**
 * Ce que la base répond quand elle refuse, traduit pour l'administrateur.
 *
 * L'écran est réservé aux administrateurs : dire qu'une adresse a déjà un
 * compte ou un dossier ne révèle rien à un inconnu, et lui évite d'ouvrir un
 * doublon.
 */
export function refusDInvitation(souci: { code?: string; message?: string } | null): {
  message: string;
  statut: number;
} {
  const texte = souci?.message ?? '';
  if (texte.includes('déjà un compte')) {
    return { message: 'Cette adresse a déjà un compte.', statut: 409 };
  }
  if (texte.includes('dossier existe déjà')) {
    return {
      message: 'Un dossier existe déjà pour cette adresse. Retrouvez-le dans la liste des candidats.',
      statut: 409,
    };
  }
  if (souci?.code === '42501') {
    return { message: 'Seul un administrateur peut ouvrir un dossier.', statut: 403 };
  }
  if (texte.includes('Loge inconnue')) {
    return { message: 'Cette loge n’existe plus. Rechargez la page.', statut: 400 };
  }
  return { message: 'Le dossier n’a pas pu être ouvert.', statut: 400 };
}
