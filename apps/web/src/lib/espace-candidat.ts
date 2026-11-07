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

// ————————————————————————————————————————————————————————————————————————————
// L'espace du candidat
// ————————————————————————————————————————————————————————————————————————————

/** Ce que `ma_fiche()` (migration 0060) rend : la fiche, sans rien de la commission. */
export type MaFiche = {
  id: string;
  numero: number | null;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  age: number | null;
  situation_familiale: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  type_emploi: string | null;
  emploi_recherche: string | null;
  definition_emploi: string | null;
  mobilite_geographique: string | null;
  debut_stage: string | null;
  fin_stage: string | null;
  formations: string | null;
  experiences: string | null;
  competences: string | null;
  informatique: string | null;
  savoir_etre: string | null;
  centres_interet: string | null;
  permis_vl: string | null;
  permis_moto: string | null;
  permis_pl: string | null;
  vehicule: string | null;
  a_un_cv: boolean;
  a_une_lettre: boolean;
  candidature_completee_le: string | null;
  maj_le: string | null;
};

/**
 * Ce que l'espace montre d'abord.
 *
 *   · `cv`    — rien encore : on demande le CV, c'est la première chose ;
 *   · `fiche` — le CV est là, la fiche a déjà été enregistrée, ou le
 *               candidat a choisi de la remplir sans CV.
 */
export function premierEcran(fiche: Pick<MaFiche, 'a_un_cv' | 'candidature_completee_le'>, sansCv: boolean): 'cv' | 'fiche' {
  if (fiche.a_un_cv || fiche.candidature_completee_le || sansCv) return 'fiche';
  return 'cv';
}

/**
 * Le format qu'accepte chaque document. Le CV est un PDF : c'est ce que
 * HERACLES saura lire pour pré-remplir la fiche, et ce que la base exige
 * (`ranger_mon_document`). La lettre garde les formats de 0057.
 */
export function formatAccepte(genre: 'cv' | 'lettre', format: string | null): boolean {
  if (!format) return false;
  if (genre === 'cv') return format === 'pdf';
  return ['pdf', 'doc', 'docx', 'odt', 'rtf', 'jpg', 'png', 'webp'].includes(format);
}

/** Les autres chemins qu'une lettre a pu prendre, à effacer quand elle change de format. */
export function anciennesLettres(candidat: string, format: string): string[] {
  return ['pdf', 'doc', 'docx', 'odt', 'rtf', 'jpg', 'png', 'webp']
    .filter((f) => f !== format)
    .map((f) => `candidat/lettre/${candidat}.${f}`);
}
