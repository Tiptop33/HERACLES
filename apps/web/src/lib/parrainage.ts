import { z } from 'zod';

/**
 * Le parcours d'un nouveau candidat, tel que Bubble le menait (migration 0057) :
 *
 *   1. un référent invite un parrain ;
 *   2. le parrain présente le candidat, par son lien ;
 *   3. le candidat complète sa fiche, par le sien.
 *
 * Ce fichier ne porte que des règles — listes de choix, validation, textes des
 * courriels — et rien qui touche à la base : il se teste sans elle. Les
 * lectures par jeton sont dans `parrainage-serveur.ts`.
 */

// ————————————————————————————————————————————————————————————————————————————
// Les listes de choix de Bubble, à l'identique
// ————————————————————————————————————————————————————————————————————————————

/**
 * La liste EMPLOI de Bubble. La valeur est celle que l'API rendait et que
 * portent les fiches reprises — c'est elle que `famille_de_recherche()` range.
 * Le libellé est ce qu'on affiche.
 */
export const TYPES_DE_RECHERCHE = [
  { valeur: 'emploi', libelle: 'Emploi' },
  { valeur: "changement d'Emploi", libelle: 'Changement d’emploi' },
  { valeur: 'stage en alternance', libelle: 'Stage en alternance' },
  { valeur: 'stage', libelle: 'Stage' },
] as const;

const VALEURS_DE_RECHERCHE = TYPES_DE_RECHERCHE.map((t) => t.valeur) as [string, ...string[]];

/** Le libellé d'un type de recherche, ou la valeur telle quelle. */
export function libelleDeRecherche(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  return TYPES_DE_RECHERCHE.find((t) => t.valeur === valeur)?.libelle ?? valeur;
}

/** Vrai si le type désigne un stage — la fiche demande alors ses dates. */
export function estUnStage(valeur: string | null | undefined): boolean {
  return Boolean(valeur && /stage/i.test(valeur));
}

/**
 * La situation familiale, telle que la page `renseignement_candidat` la
 * proposait. Les quatre premières disent le lien avec le parrain plutôt qu'un
 * état civil : c'est la liste de Bubble, reprise sans la corriger.
 */
export const SITUATIONS_FAMILIALES = [
  'le fils',
  'la fille',
  'la femme',
  'la concubine',
  'Pacsé',
  'Marié',
  'Veuf',
  'Divorcé',
] as const;

export const MOBILITES = [
  'Agglomération',
  'Départementale',
  'Régionale',
  'France',
  'International',
] as const;

export const OUI_NON = ['Oui', 'Non'] as const;

// ————————————————————————————————————————————————————————————————————————————
// Validation
// ————————————————————————————————————————————————————————————————————————————

/** Chaîne facultative : vide ou blancs deviennent `undefined`. */
const facultatif = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'Ce champ est trop long.')
    .optional()
    .transform((valeur) => (valeur ? valeur : undefined));

/** Chaîne obligatoire, avec le message qui dit laquelle manque. */
const obligatoire = (max: number, message: string) =>
  z.string({ error: message }).trim().min(1, message).max(max, 'Ce champ est trop long.');

const courriel = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(320, 'Cette adresse est trop longue.')
    .pipe(z.email('Cette adresse e-mail n’est pas valide.'));

const parmi = <T extends readonly [string, ...string[]]>(valeurs: T, message: string) =>
  z.enum(valeurs, { error: message });

/**
 * Un nombre entier saisi dans un champ. `z.coerce.number()` lirait une case
 * vide comme 0 — une urgence nulle ou un âge de zéro an que personne n'a
 * donnés. Le vide reste donc vide, et se fait refuser comme tel.
 */
const entier = (min: number, max: number, manque: string, horsBornes: string) =>
  z.preprocess(
    (valeur) => (typeof valeur === 'string' && valeur.trim() === '' ? undefined : valeur),
    z.coerce
      .number({ error: manque })
      .int(horsBornes)
      .min(min, horsBornes)
      .max(max, horsBornes),
  );

const jourFacultatif = z
  .string()
  .trim()
  .optional()
  .transform((valeur) => (valeur ? valeur : undefined))
  .refine((valeur) => valeur === undefined || /^\d{4}-\d{2}-\d{2}$/.test(valeur), {
    message: 'Cette date ne se lit pas.',
  });

/** Une case laissée vide vaut une case absente. */
const courrielFacultatif = (message: string) =>
  z.preprocess(
    (valeur) => (typeof valeur === 'string' && valeur.trim() === '' ? undefined : valeur),
    courriel(message).optional(),
  );

/**
 * Ce que reçoit la route d'invitation : l'adresse du parrain, celle du
 * candidat, ou les deux — jamais aucune (migrations 0059 et 0060).
 *
 *   · les deux : le parrain est invité, l'adresse du candidat l'attend
 *     pré-remplie dans son formulaire ;
 *   · le parrain seul : comme avant ;
 *   · le candidat seul : le dossier s'ouvre sans parrain, et le candidat
 *     reçoit directement le lien vers sa fiche.
 *
 * La même adresse dans les deux cases est une erreur de saisie, pas un
 * candidat qui se parraine lui-même.
 */
export const InvitationParrain = z
  .object({
    candidat_email: courrielFacultatif('Indiquez l’adresse e-mail du candidat.'),
    email: courrielFacultatif('Indiquez l’adresse e-mail du parrain.'),
  })
  .refine((v) => v.email !== undefined || v.candidat_email !== undefined, {
    path: ['candidat_email'],
    message: 'Indiquez au moins une adresse : celle du candidat ou celle du parrain.',
  })
  .refine(
    (v) => !v.email || !v.candidat_email || v.email.toLowerCase() !== v.candidat_email.toLowerCase(),
    { path: ['email'], message: 'Le parrain et le candidat ne peuvent pas avoir la même adresse.' },
  );

/** La fenêtre « Nouveau candidat » valide exactement ce que la route validera. */
export const FenetreNouveauCandidat = InvitationParrain;

/**
 * La page du parrain : ce qu'il dit de lui, puis du candidat. Champs
 * obligatoires : ceux que Bubble exigeait.
 */
export const FormulaireParrain = z.object({
  parrain_nom: obligatoire(120, 'Indiquez votre nom.'),
  parrain_prenom: facultatif(120),
  parrain_telephone: facultatif(40),
  parrain_loge: facultatif(200),

  lien_parente: facultatif(200),
  connait_appartenance: parmi(OUI_NON, 'Dites si le candidat connaît votre appartenance.'),
  peut_se_devoiler: parmi(OUI_NON, 'Dites si un membre de la commission peut se dévoiler.'),
  urgence: entier(0, 5, 'Indiquez le degré d’urgence, de 0 à 5.', 'L’urgence va de 0 à 5.'),
  urgence_motif: facultatif(2000),

  candidat_nom: obligatoire(120, 'Indiquez le nom du candidat.'),
  candidat_prenom: obligatoire(120, 'Indiquez le prénom du candidat.'),
  candidat_email: courriel('Indiquez l’adresse e-mail du candidat : c’est là qu’il recevra son lien.'),
  type_emploi: parmi(VALEURS_DE_RECHERCHE, 'Choisissez le type de recherche.'),
});

export type Parrain = z.infer<typeof FormulaireParrain>;

const identiteDuCandidat = {
  prenom: obligatoire(120, 'Indiquez votre prénom.'),
  nom: obligatoire(120, 'Indiquez votre nom.'),
};

/**
 * Les champs de la fiche que le candidat remplit lui-même, hors adresse
 * e-mail et consentement. Partagés par le lien de 0057 et par l'espace
 * candidat (0060) : une même fiche obéit aux mêmes règles, d'où qu'on la
 * remplisse.
 */
const reponsesDuCandidat = {
  telephone: obligatoire(40, 'Indiquez votre téléphone.'),
  age: entier(14, 99, 'Indiquez votre âge.', 'Votre âge doit être compris entre 14 et 99 ans.'),
  situation_familiale: parmi(SITUATIONS_FAMILIALES, 'Choisissez votre situation familiale.'),
  adresse: obligatoire(300, 'Indiquez votre adresse.'),
  code_postal: obligatoire(10, 'Indiquez votre code postal.').regex(
    /^[0-9A-Za-z -]{3,10}$/,
    'Ce code postal ne se lit pas.',
  ),
  ville: obligatoire(120, 'Indiquez votre ville.'),

  type_emploi: parmi(VALEURS_DE_RECHERCHE, 'Choisissez le type de recherche.'),
  emploi_recherche: obligatoire(200, 'Indiquez le métier que vous visez.'),
  definition_emploi: obligatoire(2000, 'Décrivez précisément l’emploi recherché.'),
  mobilite_geographique: parmi(MOBILITES, 'Choisissez votre mobilité géographique.'),
  debut_stage: jourFacultatif,
  fin_stage: jourFacultatif,

  permis_vl: parmi(OUI_NON, 'Dites si vous avez le permis B.'),
  permis_moto: parmi(OUI_NON, 'Dites si vous avez le permis moto.'),
  permis_pl: parmi(OUI_NON, 'Dites si vous avez le permis poids lourd.'),
  vehicule: parmi(OUI_NON, 'Dites si vous avez un véhicule.'),

  formations: obligatoire(5000, 'Décrivez votre formation.'),
  experiences: obligatoire(5000, 'Décrivez vos expériences.'),
  competences: obligatoire(3000, 'Indiquez vos compétences.'),
  informatique: facultatif(2000),
  savoir_etre: facultatif(2000),
  centres_interet: facultatif(2000),
};

const stageDansLOrdre = {
  check: (f: { debut_stage?: string; fin_stage?: string }) =>
    !f.debut_stage || !f.fin_stage || f.debut_stage <= f.fin_stage,
  erreur: { message: 'La fin du stage précède son début.', path: ['fin_stage'] },
};

// Le cadrage (§ 9) le demande : un consentement explicite, et une information
// claire sur qui voit quoi. La case n'est pas conservée en tant que telle — la
// date d'envoi de la fiche en tient lieu.
const consentement = z.literal('oui', {
  error: 'Cochez la case de consentement pour envoyer votre fiche.',
});

/**
 * La page du candidat. Champs obligatoires : ceux que `renseignement_candidat`
 * exigeait — le secteur et le métier ROME exceptés, dont les référentiels ne
 * sont pas encore repris : le métier visé se dit en clair.
 */
export const FormulaireCandidature = z
  .object({
    ...identiteDuCandidat,
    email: courriel('Indiquez votre adresse e-mail.'),
    ...reponsesDuCandidat,
    consentement,
  })
  .refine(stageDansLOrdre.check, stageDansLOrdre.erreur);

/**
 * La fiche, depuis l'espace candidat. Ni adresse e-mail — c'est celle du
 * compte —, ni consentement à chaque fois : il n'est demandé qu'au premier
 * enregistrement (voir `FicheAuPremierEnvoi`).
 */
export const FicheDuCandidat = z
  .object({ ...identiteDuCandidat, ...reponsesDuCandidat })
  .refine(stageDansLOrdre.check, stageDansLOrdre.erreur);

export const FicheAuPremierEnvoi = z
  .object({ ...identiteDuCandidat, ...reponsesDuCandidat, consentement })
  .refine(stageDansLOrdre.check, stageDansLOrdre.erreur);

export type Candidature = z.infer<typeof FormulaireCandidature>;

/**
 * Le premier message d'erreur lisible d'une validation, et le champ qu'il vise.
 * Zod répond « Invalid input » quand un champ manque tout à fait : on ne le
 * montre jamais tel quel.
 */
export function premiereErreur(erreur: z.ZodError): { champ: string | null; message: string } {
  const probleme = erreur.issues[0];
  const champ = probleme?.path?.[0] ? String(probleme.path[0]) : null;
  const message =
    probleme?.message && !/^Invalid/.test(probleme.message)
      ? probleme.message
      : 'Un champ est incomplet.';
  return { champ, message };
}

// ————————————————————————————————————————————————————————————————————————————
// Les fichiers
// ————————————————————————————————————————————————————————————————————————————

/** Dix mégaoctets : large pour un CV, même photographié. */
export const TAILLE_MAXIMALE_DOCUMENT = 10 * 1024 * 1024;

/** Où ranger le CV ou la lettre d'un candidat. La base n'accepte que ce chemin. */
export function cheminDuDocument(genre: 'cv' | 'lettre', candidat: string, format: string): string {
  return `candidat/${genre}/${candidat}.${format}`;
}

// ————————————————————————————————————————————————————————————————————————————
// Les liens et les courriels
// ————————————————————————————————————————————————————————————————————————————

export function lienDuParrain(origine: string, jeton: string): string {
  return `${origine.replace(/\/+$/, '')}/parrainage/${jeton}`;
}

export function lienDuCandidat(origine: string, jeton: string): string {
  return `${origine.replace(/\/+$/, '')}/candidature/${jeton}`;
}

/** Les modèles de la commission, repris de Bubble dans `parametre`. */
export type Modeles = {
  objet_parrain?: string | null;
  mot_parrain?: string | null;
  objet_relance_parrain?: string | null;
  mot_relance_parrain?: string | null;
  objet_candidat?: string | null;
  mot_candidat?: string | null;
};

type Message = { sujet: string; texte: string };

/**
 * Le modèle de la commission s'il existe, puis le lien — toujours à la fin et
 * sur sa propre ligne. Les textes de Bubble ne connaissent pas nos liens : on
 * ne les cherche pas dans le modèle, on les ajoute.
 */
function composer(
  modele: string | null | undefined,
  defaut: string,
  lien: string,
  signature: string,
): string {
  const corps = modele?.trim() || defaut;
  return `${corps}\n\n${lien}\n\nCe lien est personnel : ne le transférez pas. Il reste valable trente jours.\n\n${signature}`;
}

export function courrielAuParrain(
  modeles: Modeles,
  lien: string,
  loge: string | null,
  referent: string | null,
): Message {
  const signature = [referent, loge ? `Commission HERACLES — ${loge}` : 'Commission HERACLES']
    .filter(Boolean)
    .join('\n');

  return {
    sujet: modeles.objet_parrain?.trim() || 'HERACLES — présentation d’un candidat',
    texte: composer(
      modeles.mot_parrain,
      'Bonjour,\n\nVous nous avez parlé d’une personne en recherche d’emploi, d’alternance ou de stage. Pour que la commission puisse l’accompagner, merci de nous la présenter en remplissant le formulaire ci-dessous.',
      lien,
      signature,
    ),
  };
}

export function courrielDeRelance(
  modeles: Modeles,
  lien: string,
  loge: string | null,
  referent: string | null,
): Message {
  const premier = courrielAuParrain(modeles, lien, loge, referent);

  return {
    sujet: modeles.objet_relance_parrain?.trim() || `Rappel — ${premier.sujet}`,
    texte: composer(
      modeles.mot_relance_parrain,
      'Bonjour,\n\nNous n’avons pas encore reçu votre présentation. Le formulaire reste ouvert à l’adresse ci-dessous.',
      lien,
      [referent, loge ? `Commission HERACLES — ${loge}` : 'Commission HERACLES']
        .filter(Boolean)
        .join('\n'),
    ),
  };
}

export function courrielAuCandidat(
  modeles: Modeles,
  lien: string,
  loge: string | null,
  prenom: string,
): Message {
  return {
    // L'objet de la page `parrain` de Bubble, mot pour mot.
    sujet: modeles.objet_candidat?.trim() || 'DEMANDE DE RENSEIGNEMENTS',
    texte: composer(
      modeles.mot_candidat,
      `Bonjour ${prenom},\n\nVotre parrain nous a présenté votre recherche. Pour que nous puissions vous accompagner, merci de compléter votre fiche et d’y joindre votre CV.`,
      lien,
      loge ? `Commission HERACLES — ${loge}` : 'Commission HERACLES',
    ),
  };
}

/**
 * Le courriel au candidat dont le dossier s'ouvre sans parrain (0060). Pas de
 * modèle Bubble ici : celui de la commission parle du parrain, qui n'existe
 * pas. L'objet, lui, reste le même.
 */
export function courrielAuCandidatSansParrain(
  modeles: Modeles,
  lien: string,
  loge: string | null,
  referent: string | null,
): Message {
  const signature = [referent, loge ? `Commission HERACLES — ${loge}` : 'Commission HERACLES']
    .filter(Boolean)
    .join('\n');
  return {
    sujet: modeles.objet_candidat?.trim() || 'DEMANDE DE RENSEIGNEMENTS',
    texte: composer(
      null,
      'Bonjour,\n\nVous êtes à la recherche d’un emploi, d’une alternance ou d’un stage, et la commission HERACLES souhaite vous accompagner. Pour cela, merci de compléter votre fiche et d’y joindre votre CV.',
      lien,
      signature,
    ),
  };
}

// ————————————————————————————————————————————————————————————————————————————
// L'état d'un parrainage, tel que la base le calcule
// ————————————————————————————————————————————————————————————————————————————

export type EtatDuParrainage =
  | 'attente_parrain'
  | 'attente_candidat'
  | 'complete'
  | 'expire'
  | 'revoque';

export const ETATS: Record<EtatDuParrainage, string> = {
  attente_parrain: 'Attend le parrain',
  attente_candidat: 'Attend le candidat',
  complete: 'Fiche complète',
  expire: 'Lien expiré',
  revoque: 'Remplacé',
};

export type LigneDeParrainage = {
  id: string;
  /** `null` pour un dossier ouvert sans parrain (0060). */
  parrain_email: string | null;
  parrain_nom: string | null;
  envoye_par_nom: string | null;
  cree_le: string;
  relance_le: string | null;
  presente_le: string | null;
  candidat_id: string | null;
  candidat_nom: string | null;
  candidature_completee_le: string | null;
  etat: EtatDuParrainage;
};
