import { z } from 'zod';
import { CODE_DE_CANDIDAT } from './secteurs';

/**
 * Les offres saisies à la main (migration 0114) : ce qu'en sait l'écran.
 *
 * Module pur, pour le serveur comme pour le navigateur : le formulaire de la
 * fenêtre « Nouvelle offre » et les routes qui l'enregistrent contrôlent avec
 * le même schéma. La base contrôle de nouveau (`offre_saisie_controlee`) : un
 * écran ne protège rien.
 *
 * Décisions du 27 novembre 2026 : docs/maquettes/saisie-d-une-offre-propositions-notes.md.
 */

export const TYPES_D_OFFRE = ['emploi', 'stage', 'alternance'] as const;
export type TypeDOffre = (typeof TYPES_D_OFFRE)[number];

/** Le nom du type, tel qu'il s'écrit dans la fiche et dans le détail. */
export const NOM_DU_TYPE: Record<TypeDOffre, string> = {
  emploi: 'Emploi',
  stage: 'Stage',
  alternance: 'Stage en alternance',
};

/** Le nom court, celui de l'étiquette de la liste. */
export const ETIQUETTE_DU_TYPE: Record<TypeDOffre, string> = {
  emploi: 'Emploi',
  stage: 'Stage',
  alternance: 'Alternance',
};

/** Un type d'offre lu ailleurs — la base, une adresse —, ou `null`. */
export function lireTypeDOffre(valeur: unknown): TypeDOffre | null {
  return TYPES_D_OFFRE.includes(valeur as TypeDOffre) ? (valeur as TypeDOffre) : null;
}

export const CONTRATS = ['CDI', 'CDD', 'Intérim'] as const;
export type Contrat = (typeof CONTRATS)[number];

/** La durée a-t-elle un sens ? Pour un stage, une alternance, un CDD, une mission d'intérim. */
export function dureeAUnSens(type: TypeDOffre | null, contrat: Contrat | null): boolean {
  if (type === 'stage' || type === 'alternance') return true;
  return type === 'emploi' && (contrat === 'CDD' || contrat === 'Intérim');
}

/** Combien de jours une offre saisie reste en ligne, sans prolongation. */
export const JOURS_EN_LIGNE = 30;

// --- La fiche ---------------------------------------------------------------

/** Un texte facultatif : vide devient `null`, espaces resserrées. */
const facultatif = (longueur: number, message: string) =>
  z
    .string()
    .optional()
    .transform((v) => v?.replace(/\s+/g, ' ').trim() || null)
    .refine((v) => v === null || v.length <= longueur, message);

const requis = (longueur: number, vide: string, long: string) =>
  z
    .string({ error: vide })
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .refine((v) => v.length > 0, vide)
    .refine((v) => v.length <= longueur, long);

/**
 * La fiche d'une offre saisie, telle que la fenêtre l'envoie. Les messages
 * sont ceux qu'on affiche : le premier qui échoue est montré.
 */
export const FicheDOffre = z
  .object({
    type_offre: z.enum(TYPES_D_OFFRE, { error: 'Choisissez le type d’offre : emploi, stage ou stage en alternance.' }),
    intitule: requis(200, 'L’intitulé du poste est requis.', 'L’intitulé tient en 200 caractères.'),
    entreprise: requis(200, 'Le nom de l’entreprise est requis.', 'Le nom de l’entreprise tient en 200 caractères.'),
    code_postal: z
      .string({ error: 'Le code postal est requis.' })
      .transform((v) => v.replace(/\s/g, ''))
      .refine((v) => /^[0-9]{5}$/.test(v), 'Le code postal compte cinq chiffres.'),
    ville: requis(100, 'La ville est requise.', 'La ville tient en 100 caractères.'),
    contrat: z
      .enum(CONTRATS, { error: 'Le contrat est CDI, CDD ou Intérim.' })
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    duree: facultatif(60, 'La durée tient en 60 caractères.'),
    secteur: z
      .string({ error: 'Choisissez le secteur d’activité de l’offre.' })
      .trim()
      .toUpperCase()
      .refine((v) => CODE_DE_CANDIDAT.test(v), 'Choisissez le secteur d’activité de l’offre.'),
    description: z
      .string()
      .optional()
      .transform((v) => v?.trim() || null)
      .refine((v) => v === null || v.length <= 10000, 'La description tient en 10 000 caractères.'),
    lien: facultatif(2000, 'Le lien tient en 2 000 caractères.').refine(
      (v) => v === null || /^https?:\/\/\S+$/i.test(v),
      'Le lien de l’annonce commence par https:// ou http://.',
    ),
    contact: facultatif(300, 'Le contact tient en 300 caractères.'),
  })
  .strict()
  // Un stage est un stage : le contrat ne se dit que d'un emploi. Et un CDI
  // n'a pas de durée — elle est oubliée plutôt que refusée, comme en base.
  .transform((f) => {
    const contrat = f.type_offre === 'emploi' ? f.contrat : null;
    return { ...f, contrat, duree: dureeAUnSens(f.type_offre, contrat) ? f.duree : null };
  });

export type FicheDOffre = z.output<typeof FicheDOffre>;

/** Le premier message d'erreur d'une fiche refusée. */
export function premiereErreurDeLaFiche(erreur: z.ZodError): string {
  return erreur.issues[0]?.message ?? 'La fiche est illisible.';
}

// --- Ce que la base rend ------------------------------------------------------

const texte = z.string().nullable();

const SecteurDeLOffre = z.object({
  code: z.string(),
  intitule: z.string(),
  niveau: z.enum(['section', 'division']),
  section: z.string(),
  section_intitule: z.string(),
});

/** L'offre telle que la fenêtre de modification la remplit (`offre_a_modifier`, 0114). */
const OffreAModifier = z.object({
  id: z.string(),
  type_offre: z.enum(TYPES_D_OFFRE),
  intitule: texte,
  entreprise: texte,
  code_postal: texte,
  ville: texte,
  contrat: z.enum(CONTRATS).nullable(),
  duree: texte,
  description: texte,
  lien: texte,
  contact: texte,
  secteur: SecteurDeLOffre.nullable(),
  en_ligne_jusqu_au: z.string(),
});

export type OffreAModifier = z.infer<typeof OffreAModifier>;
export type SecteurDeLOffre = z.infer<typeof SecteurDeLOffre>;

/** Lit la réponse de la base. `null` : rien à modifier, ou une forme inattendue. */
export function lireOffreAModifier(donnees: unknown): OffreAModifier | null {
  if (donnees === null || donnees === undefined) return null;
  const lu = OffreAModifier.safeParse(donnees);
  return lu.success ? lu.data : null;
}

/** Vrai si l'offre est encore dans la liste des offres en cours. */
export function estEnLigne(offre: Pick<OffreAModifier, 'en_ligne_jusqu_au'>, maintenant: Date = new Date()): boolean {
  const fin = new Date(offre.en_ligne_jusqu_au);
  return !Number.isNaN(fin.getTime()) && fin.getTime() > maintenant.getTime();
}

/** Les offres saisies sorties de la liste (`offres_saisies_echues`, 0114). */
const OffresEchues = z.array(
  z.object({
    id: z.string(),
    intitule: texte,
    entreprise_nom: texte,
    lieu_libelle: texte,
    type_contrat_libelle: texte,
    type_offre: z.enum(TYPES_D_OFFRE).nullable(),
    date_creation: texte,
  }),
);

export type OffreEchue = z.infer<typeof OffresEchues>[number];

/** Lit la réponse de la base. `null` si elle n'a pas la forme attendue. */
export function lireOffresEchues(donnees: unknown): OffreEchue[] | null {
  const lu = OffresEchues.safeParse(donnees);
  return lu.success ? lu.data : null;
}

/** La fiche vide d'une nouvelle offre — ou remplie d'une offre à modifier. */
export type ValeursDeLaFiche = {
  type_offre: TypeDOffre | null;
  intitule: string;
  entreprise: string;
  code_postal: string;
  ville: string;
  contrat: Contrat | null;
  duree: string;
  secteur: SecteurDeLOffre | null;
  description: string;
  lien: string;
  contact: string;
};

export const FICHE_VIDE: ValeursDeLaFiche = {
  type_offre: null,
  intitule: '',
  entreprise: '',
  code_postal: '',
  ville: '',
  contrat: null,
  duree: '',
  secteur: null,
  description: '',
  lien: '',
  contact: '',
};

export function valeursDeLOffre(o: OffreAModifier): ValeursDeLaFiche {
  return {
    type_offre: o.type_offre,
    intitule: o.intitule ?? '',
    entreprise: o.entreprise ?? '',
    code_postal: o.code_postal ?? '',
    ville: o.ville ?? '',
    contrat: o.contrat,
    duree: o.duree ?? '',
    secteur: o.secteur,
    description: o.description ?? '',
    lien: o.lien ?? '',
    contact: o.contact ?? '',
  };
}

/** Ce que la fenêtre envoie : la fiche telle qu'elle est à l'écran. */
export function demandeDeLaFiche(v: ValeursDeLaFiche): Record<string, unknown> {
  return {
    type_offre: v.type_offre ?? undefined,
    intitule: v.intitule,
    entreprise: v.entreprise,
    code_postal: v.code_postal,
    ville: v.ville,
    contrat: v.contrat,
    duree: v.duree,
    secteur: v.secteur?.code ?? '',
    description: v.description,
    lien: v.lien,
    contact: v.contact,
  };
}

/**
 * Le département d'un code postal, comme la base le déduit
 * (`departement_d_une_offre`, 0098) : deux chiffres, trois outre-mer, la
 * Corse partagée entre 2A et 2B. `null` tant que le code n'a pas cinq chiffres.
 */
export function departementDuCodePostal(codePostal: string): string | null {
  const cp = codePostal.replace(/\s/g, '');
  if (!/^[0-9]{5}$/.test(cp)) return null;
  if (/^9[78]/.test(cp)) return cp.slice(0, 3);
  if (/^20[01]/.test(cp)) return '2A';
  if (/^20[26]/.test(cp)) return '2B';
  return cp.slice(0, 2);
}

/** Le premier champ en cause dans une fiche refusée, pour le signaler à l'écran. */
export function champEnCause(erreur: z.ZodError): string | null {
  const champ = erreur.issues[0]?.path[0];
  return typeof champ === 'string' ? champ : null;
}
