import { z } from 'zod';
import { MOBILITES, OUI_NON, TYPES_DE_RECHERCHE, estUnStage } from './parrainage';
import { TYPES_D_OFFRE } from './offres-saisies';
import type { SecteurDuCandidat } from './secteurs';

/**
 * La page du candidat (migration 0105, maquette docs/maquettes/page-candidat.html).
 *
 * Ce module est pur : il sert au navigateur, aux routes et aux tests. Ce qu'il
 * vérifie, la base le revérifie (`modifier_ma_fiche_de_candidat`) : ici, on
 * écrit seulement les messages en français, sous le champ qu'ils concernent.
 */

// ————————————————————————————————————————————————————————————————————————————
// La fiche
// ————————————————————————————————————————————————————————————————————————————

/**
 * La situation familiale, telle que le candidat la choisit sur sa page. La
 * liste de Bubble (`SITUATIONS_FAMILIALES`) commence par « le fils, la fille,
 * la femme, la concubine » : le lien avec le parrain, pas un état civil. Le
 * candidat ne voit que l'état civil, « Célibataire » compris, qui manquait.
 */
export const SITUATIONS_DU_CANDIDAT = ['Célibataire', 'Pacsé', 'Marié', 'Veuf', 'Divorcé'] as const;

export type Option = { valeur: string; libelle: string };

const options = (valeurs: readonly string[]): Option[] => valeurs.map((v) => ({ valeur: v, libelle: v }));

export type GenreDeChamp = 'texte' | 'tel' | 'nombre' | 'date' | 'long' | 'choix' | 'boutons';

export type ChampDeLaFiche = {
  cle: CleModifiable;
  libelle: string;
  genre: GenreDeChamp;
  max?: number;
  obligatoire?: boolean;
  options?: readonly Option[];
  /** Le champ prend toute la largeur du bloc. */
  large?: boolean;
  /** Seulement pour un stage ou une alternance. */
  stage?: boolean;
};

/** Les colonnes que le candidat écrit lui-même — et aucune autre (0105). */
export const CLES_MODIFIABLES = [
  'prenom', 'nom', 'telephone', 'age', 'situation_familiale', 'adresse', 'code_postal', 'ville',
  'type_emploi', 'emploi_recherche', 'definition_emploi', 'mobilite_geographique',
  'debut_stage', 'fin_stage',
  'permis_vl', 'permis_moto', 'permis_pl', 'vehicule',
  'formations', 'experiences', 'competences', 'informatique', 'savoir_etre', 'centres_interet',
] as const;

export type CleModifiable = (typeof CLES_MODIFIABLES)[number];

export function estCleModifiable(valeur: unknown): valeur is CleModifiable {
  return typeof valeur === 'string' && (CLES_MODIFIABLES as readonly string[]).includes(valeur);
}

const OUI_NON_OPTIONS = options(OUI_NON);

export const SECTIONS_DE_LA_FICHE: readonly {
  titre: string;
  ouverte: boolean;
  champs: readonly ChampDeLaFiche[];
}[] = [
  {
    titre: 'Identité et contact',
    ouverte: true,
    champs: [
      { cle: 'prenom', libelle: 'Prénom', genre: 'texte', max: 120, obligatoire: true },
      { cle: 'nom', libelle: 'Nom', genre: 'texte', max: 120, obligatoire: true },
      { cle: 'telephone', libelle: 'Téléphone', genre: 'tel', max: 40, obligatoire: true },
      { cle: 'age', libelle: 'Âge', genre: 'nombre' },
      { cle: 'situation_familiale', libelle: 'Situation familiale', genre: 'choix', options: options(SITUATIONS_DU_CANDIDAT) },
      { cle: 'adresse', libelle: 'Adresse', genre: 'texte', max: 300, large: true },
      { cle: 'code_postal', libelle: 'Code postal', genre: 'texte', max: 10 },
      { cle: 'ville', libelle: 'Ville', genre: 'texte', max: 120 },
    ],
  },
  {
    titre: 'Ma recherche',
    ouverte: true,
    champs: [
      {
        cle: 'type_emploi',
        libelle: 'Je cherche',
        genre: 'boutons',
        large: true,
        options: TYPES_DE_RECHERCHE.map((t) => ({ valeur: t.valeur, libelle: t.libelle })),
      },
      { cle: 'debut_stage', libelle: 'Début', genre: 'date', stage: true },
      { cle: 'fin_stage', libelle: 'Fin', genre: 'date', stage: true },
      { cle: 'emploi_recherche', libelle: 'Métier visé', genre: 'texte', max: 200, large: true },
      { cle: 'definition_emploi', libelle: 'Ce que je cherche, en quelques lignes', genre: 'long', max: 2000, large: true },
      { cle: 'mobilite_geographique', libelle: 'Jusqu’où je peux aller', genre: 'choix', options: options(MOBILITES) },
    ],
  },
  {
    titre: 'Permis et véhicule',
    ouverte: false,
    champs: [
      { cle: 'permis_vl', libelle: 'Permis B', genre: 'boutons', options: OUI_NON_OPTIONS },
      { cle: 'permis_moto', libelle: 'Permis moto', genre: 'boutons', options: OUI_NON_OPTIONS },
      { cle: 'permis_pl', libelle: 'Permis poids lourd', genre: 'boutons', options: OUI_NON_OPTIONS },
      { cle: 'vehicule', libelle: 'Véhicule', genre: 'boutons', options: OUI_NON_OPTIONS },
    ],
  },
  {
    titre: 'Mon parcours',
    ouverte: false,
    champs: [
      { cle: 'formations', libelle: 'Formations', genre: 'long', max: 5000, large: true },
      { cle: 'experiences', libelle: 'Expériences', genre: 'long', max: 5000, large: true },
      { cle: 'competences', libelle: 'Compétences', genre: 'long', max: 3000, large: true },
      { cle: 'informatique', libelle: 'Informatique', genre: 'long', max: 2000 },
      { cle: 'savoir_etre', libelle: 'Savoir-être', genre: 'long', max: 2000 },
      { cle: 'centres_interet', libelle: 'Centres d’intérêt', genre: 'long', max: 2000 },
    ],
  },
];

const CHAMPS = Object.fromEntries(
  SECTIONS_DE_LA_FICHE.flatMap((s) => s.champs.map((c) => [c.cle, c])),
) as Record<CleModifiable, ChampDeLaFiche>;

export function champDeLaFiche(cle: CleModifiable): ChampDeLaFiche {
  return CHAMPS[cle];
}

/** Ce que la base rend de la fiche (`ma_fiche_de_candidat`, 0105). */
const texte = z.string().nullable().optional().transform((v) => v ?? null);

export const FicheDuCandidat = z.object({
  id: z.string(),
  numero: z.number().nullable().optional().transform((v) => v ?? null),
  email: texte,
  prenom: texte,
  nom: texte,
  telephone: texte,
  age: z.number().nullable().optional().transform((v) => v ?? null),
  situation_familiale: texte,
  adresse: texte,
  code_postal: texte,
  ville: texte,
  type_emploi: texte,
  emploi_recherche: texte,
  definition_emploi: texte,
  mobilite_geographique: texte,
  debut_stage: texte,
  fin_stage: texte,
  permis_vl: texte,
  permis_moto: texte,
  permis_pl: texte,
  vehicule: texte,
  formations: texte,
  experiences: texte,
  competences: texte,
  informatique: texte,
  savoir_etre: texte,
  centres_interet: texte,
  a_une_photo: z.boolean(),
  referent: texte,
  secteurs: z.array(z.custom<SecteurDuCandidat>()).default([]),
});

export type FicheDuCandidat = z.infer<typeof FicheDuCandidat>;

export function lireFicheDuCandidat(donnees: unknown): FicheDuCandidat | null {
  const lu = FicheDuCandidat.safeParse(donnees);
  return lu.success ? lu.data : null;
}

/** La valeur d'un champ telle que le formulaire l'affiche : du texte, jamais `null`. */
export function valeurAffichee(fiche: FicheDuCandidat, cle: CleModifiable): string {
  const v = fiche[cle];
  return v === null || v === undefined ? '' : String(v);
}

export type Verdict = { ok: true; valeur: string } | { ok: false; message: string };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

function jourValable(v: string): boolean {
  if (!JOUR.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Le verdict sur une valeur saisie. Vide est permis partout, sauf pour le
 * prénom, le nom et le téléphone — ceux que la candidature exigeait déjà.
 */
export function validerUnChamp(cle: CleModifiable, brute: unknown): Verdict {
  const champ = CHAMPS[cle];
  const v = typeof brute === 'string' ? brute.trim() : '';

  if (!v) {
    return champ.obligatoire
      ? { ok: false, message: `Indiquez votre ${champ.libelle.toLowerCase()}.` }
      : { ok: true, valeur: '' };
  }
  if (champ.max && v.length > champ.max) {
    return { ok: false, message: `${champ.max} caractères au plus.` };
  }

  switch (cle) {
    case 'telephone':
      return v.replace(/\D/g, '').length >= 10
        ? { ok: true, valeur: v }
        : { ok: false, message: 'Indiquez un numéro d’au moins dix chiffres.' };
    case 'age':
      return /^\d{1,2}$/.test(v) && Number(v) >= 14 && Number(v) <= 99
        ? { ok: true, valeur: v }
        : { ok: false, message: 'L’âge doit être compris entre 14 et 99 ans.' };
    case 'code_postal':
      return /^[0-9A-Za-z -]{3,10}$/.test(v)
        ? { ok: true, valeur: v }
        : { ok: false, message: 'Ce code postal ne se lit pas.' };
    case 'debut_stage':
    case 'fin_stage':
      return jourValable(v) ? { ok: true, valeur: v } : { ok: false, message: 'Cette date ne se lit pas.' };
  }

  if (champ.options && !champ.options.some((o) => o.valeur === v)) {
    return { ok: false, message: 'Choisissez l’une des valeurs proposées.' };
  }
  return { ok: true, valeur: v };
}

/** Le début et la fin d'un stage, dans le bon ordre — ou le message qui le dit. */
export function ordreDuStage(debut: string | null, fin: string | null): string | null {
  return debut && fin && fin < debut ? 'La fin précède le début.' : null;
}

/** Afficher les dates de stage : pour un stage, une alternance. */
export function demandeDesDates(typeEmploi: string | null): boolean {
  return estUnStage(typeEmploi);
}

// ————————————————————————————————————————————————————————————————————————————
// La jauge
// ————————————————————————————————————————————————————————————————————————————

export type Remplissage = { pourcentage: number; manquent: { cle: string; libelle: string }[] };

/**
 * À quel point la fiche est remplie : chaque champ compte pour un, la photo
 * et les secteurs aussi. Les dates de stage ne comptent que pour un stage.
 */
export function remplissage(fiche: FicheDuCandidat): Remplissage {
  const manquent: Remplissage['manquent'] = [];
  let total = 0;

  for (const s of SECTIONS_DE_LA_FICHE) {
    for (const c of s.champs) {
      if (c.stage && !demandeDesDates(fiche.type_emploi)) continue;
      total += 1;
      if (!valeurAffichee(fiche, c.cle).trim()) manquent.push({ cle: c.cle, libelle: c.libelle });
    }
  }

  total += 2;
  if (!fiche.a_une_photo) manquent.unshift({ cle: 'photo', libelle: 'Ma photo' });
  if (fiche.secteurs.length === 0) manquent.push({ cle: 'secteurs', libelle: 'Mes secteurs' });

  return { pourcentage: Math.round(((total - manquent.length) / total) * 100), manquent };
}

// ————————————————————————————————————————————————————————————————————————————
// Les documents
// ————————————————————————————————————————————————————————————————————————————

export const GENRES_DE_DOCUMENT = [
  { valeur: 'cv', titre: 'CV', un: 'un CV' },
  { valeur: 'lettre', titre: 'Lettres de motivation', un: 'une lettre' },
] as const;

export type GenreDeDocument = (typeof GENRES_DE_DOCUMENT)[number]['valeur'];

export function estGenreDeDocument(valeur: unknown): valeur is GenreDeDocument {
  return valeur === 'cv' || valeur === 'lettre';
}

/** Cinq de chaque : la base refuse le sixième (0105). */
export const DOCUMENTS_PAR_GENRE = 5;

/** Dix mégaoctets, comme le formulaire de candidature. */
export const TAILLE_MAXIMALE_DU_DOCUMENT = 10 * 1024 * 1024;

/** Deux mégaoctets, comme la photo tirée du CV. */
export const TAILLE_MAXIMALE_DE_LA_PHOTO = 2 * 1024 * 1024;

export const ACCEPTE_DOCUMENT = '.pdf,.doc,.docx,.odt,.rtf,.jpg,.jpeg,.png,.webp';
export const ACCEPTE_PHOTO = 'image/jpeg,image/png,image/webp';

export const DocumentDuCandidat = z.object({
  id: z.string(),
  genre: z.enum(['cv', 'lettre']),
  nom: z.string(),
  format: z.string(),
  taille: z.number().nullable(),
  principal: z.boolean(),
  depose_le: z.string(),
});

export type DocumentDuCandidat = z.infer<typeof DocumentDuCandidat>;

export const COLONNES_DU_DOCUMENT = 'id, genre, nom, format, taille, principal, depose_le';

export function lireDocuments(donnees: unknown): DocumentDuCandidat[] {
  const lu = z.array(DocumentDuCandidat).safeParse(donnees);
  return lu.success ? lu.data : [];
}

/** Où ranger un document : la seule forme que la base accepte (0105). */
export function cheminDUnDocument(candidat: string, id: string, format: string): string {
  return `candidat/documents/${candidat}/${id}.${format}`;
}

/** Où ranger la photo : le chemin de 0066, que la fiche du référent lit déjà. */
export function cheminDeLaPhoto(candidat: string, format: 'jpg' | 'png' | 'webp'): string {
  return `candidat/photo/${candidat}.${format}`;
}

/** Le nom proposé pour un fichier déposé : son nom, sans l'extension, en 80 caractères. */
export function nomDepuisLeFichier(nomDeFichier: string): string {
  const sans = nomDeFichier.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_]+/g, ' ').trim();
  return (sans || 'Document').slice(0, 80);
}

export function validerUnNom(brut: unknown): Verdict {
  const v = typeof brut === 'string' ? brut.trim() : '';
  if (!v) return { ok: false, message: 'Donnez un nom à ce document.' };
  if (v.length > 80) return { ok: false, message: '80 caractères au plus.' };
  return { ok: true, valeur: v };
}

/** « 412 Ko », « 1,4 Mo ». */
export function taillePourLire(octets: number | null): string | null {
  if (octets === null || octets < 0) return null;
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

// ————————————————————————————————————————————————————————————————————————————
// Les messages
// ————————————————————————————————————————————————————————————————————————————

export const LONGUEUR_DU_MESSAGE = 2000;

/** Le candidat corrige un message pendant 24 heures ; la base l'impose (0105). */
export const DUREE_DE_CORRECTION = 24 * 60 * 60 * 1000;

export const MessageDuCandidat = z.object({
  id: z.string(),
  texte: z.string(),
  ecrit_le: z.string(),
  corrige_le: z.string().nullable(),
});

export type MessageDuCandidat = z.infer<typeof MessageDuCandidat>;

export const COLONNES_DU_MESSAGE = 'id, texte, ecrit_le, corrige_le';

export function lireMessages(donnees: unknown): MessageDuCandidat[] {
  const lu = z.array(MessageDuCandidat).safeParse(donnees);
  return lu.success ? lu.data : [];
}

export function validerUnMessage(brut: unknown): Verdict {
  const v = typeof brut === 'string' ? brut.trim() : '';
  if (!v) return { ok: false, message: 'Écrivez votre message.' };
  if (v.length > LONGUEUR_DU_MESSAGE) return { ok: false, message: `${LONGUEUR_DU_MESSAGE} caractères au plus.` };
  return { ok: true, valeur: v };
}

/**
 * Combien de temps reste pour corriger, en mots — « 21 h », « 35 min » —, ou
 * `null` quand le message est désormais gardé tel quel.
 */
export function tempsPourCorriger(ecritLe: string, maintenant: number): string | null {
  const reste = new Date(ecritLe).getTime() + DUREE_DE_CORRECTION - maintenant;
  if (!Number.isFinite(reste) || reste <= 0) return null;
  if (reste >= 60 * 60 * 1000) return `${Math.floor(reste / (60 * 60 * 1000))} h`;
  return `${Math.max(1, Math.ceil(reste / 60000))} min`;
}

// ————————————————————————————————————————————————————————————————————————————
// Les offres
// ————————————————————————————————————————————————————————————————————————————

export const OFFRES_DE_LA_PAGE = 10;

const OffresPourMoi = z.object({
  total: z.number().int().nonnegative(),
  nouvelles: z.number().int().nonnegative(),
  choisis: z.array(z.string()),
  departements: z.array(z.object({ code: z.string(), nombre: z.number() })),
  offres: z.array(
    z.object({
      id: z.string(),
      intitule: z.string().nullable(),
      entreprise_nom: z.string().nullable(),
      lieu_libelle: z.string().nullable(),
      type_contrat_libelle: z.string().nullable(),
      // Le type d'une offre saisie à la main (0114) : son étiquette. Facultatif
      // le temps qu'une mise en ligne passe la migration.
      type_offre: z.enum(TYPES_D_OFFRE).nullable().optional(),
      date_creation: z.string().nullable(),
      nouvelle: z.boolean(),
    }),
  ),
});

export type OffresPourMoi = z.infer<typeof OffresPourMoi>;

export function lireOffresPourMoi(donnees: unknown): OffresPourMoi | null {
  const lu = OffresPourMoi.safeParse(donnees);
  return lu.success ? lu.data : null;
}

/** Les départements à proposer : ceux qui ont des offres, et ceux déjà cochés. */
export function departementsAProposer(o: OffresPourMoi): { code: string; nombre: number }[] {
  const vus = new Map(o.departements.map((d) => [d.code, d.nombre]));
  for (const c of o.choisis) if (!vus.has(c)) vus.set(c, 0);
  return [...vus.entries()].map(([code, nombre]) => ({ code, nombre })).sort((a, b) => a.code.localeCompare(b.code));
}

/** Basculer un département dans la liste cochée. */
export function basculer(choisis: readonly string[], code: string): string[] {
  return choisis.includes(code) ? choisis.filter((c) => c !== code) : [...choisis, code].sort();
}

const DEPARTEMENT = /^([0-9]{2}|2[AB]|9[78][0-9])$/;

export function lireDepartements(brut: unknown): string[] | null {
  if (!Array.isArray(brut) || brut.length > 20) return null;
  if (!brut.every((d) => typeof d === 'string' && DEPARTEMENT.test(d))) return null;
  return [...new Set(brut as string[])].sort();
}

/** « hier », « il y a 4 j », « aujourd’hui ». */
export function parueIlYA(date: string | null, maintenant: number): string | null {
  if (!date) return null;
  const jours = Math.floor((maintenant - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(jours)) return null;
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} j`;
}

// ————————————————————————————————————————————————————————————————————————————
// Les courriels
// ————————————————————————————————————————————————————————————————————————————

export type Message = { sujet: string; texte: string };

export function courrielDInvitationALaPage(prenom: string | null, lien: string): Message {
  return {
    sujet: 'Votre espace candidat est prêt',
    texte: [
      `Bonjour${prenom ? ` ${prenom}` : ''},`,
      'Votre espace candidat HERACLES est prêt. Vous pourrez y mettre votre fiche à jour, déposer vos CV et vos lettres de motivation, voir les offres d’emploi de vos secteurs et dire à votre référent où vous en êtes.',
      `Pour l’ouvrir, suivez ce lien :\n${lien}`,
      'Il vaut trente jours et ne sert qu’une fois. Ensuite, vous recevrez un lien de connexion à chaque visite : aucun mot de passe à retenir.',
      'Vous n’attendiez pas ce message ? Ignorez-le : rien ne se passe sans ce lien.',
    ].join('\n\n'),
  };
}

export function courrielDeConnexion(lien: string): Message {
  return {
    sujet: 'Votre lien pour ouvrir votre espace',
    texte: [
      'Bonjour,',
      `Voici votre lien pour ouvrir votre espace HERACLES :\n${lien}`,
      'Il ne sert qu’une fois, et pour peu de temps : s’il a expiré, demandez-en un autre.',
      'Vous n’avez rien demandé ? Ignorez ce message : personne ne peut se connecter sans ce lien.',
    ].join('\n\n'),
  };
}

/** Le courriel au référent. Le message lui-même n'y est jamais : il reste dans HERACLES. */
export function courrielDAlerte(
  prenomDuReferent: string | null,
  candidat: string,
  numero: number | null,
  lien: string,
): Message {
  const qui = numero ? `${candidat} (dossier n° ${numero})` : candidat;
  return {
    sujet: `${candidat} vous a laissé un message`,
    texte: [
      `Bonjour${prenomDuReferent ? ` ${prenomDuReferent}` : ''},`,
      `${qui} vous a laissé un message dans HERACLES.`,
      `Pour le lire :\n${lien}`,
    ].join('\n\n'),
  };
}

// ————————————————————————————————————————————————————————————————————————————
// La limite des liens de connexion
// ————————————————————————————————————————————————————————————————————————————

/**
 * Trois liens par adresse et par quart d'heure. Sans plafond, le formulaire
 * servirait à inonder la boîte d'un candidat. Gardé en mémoire : l'application
 * tourne dans un seul conteneur, et un redémarrage qui l'efface ne coûte qu'un
 * lien de plus.
 */
export const LIENS_PAR_QUART_D_HEURE = 3;
const QUART_D_HEURE = 15 * 60 * 1000;

export function autoriserUnLien(journal: Map<string, number[]>, adresse: string, maintenant: number): boolean {
  const cle = adresse.trim().toLowerCase();
  const recents = (journal.get(cle) ?? []).filter((t) => maintenant - t < QUART_D_HEURE);
  if (recents.length >= LIENS_PAR_QUART_D_HEURE) {
    journal.set(cle, recents);
    return false;
  }
  recents.push(maintenant);
  journal.set(cle, recents);
  // Le journal ne grossit pas sans fin : les adresses oubliées s'en vont.
  if (journal.size > 5000) {
    for (const [k, v] of journal) if (v.every((t) => maintenant - t >= QUART_D_HEURE)) journal.delete(k);
  }
  return true;
}

// ————————————————————————————————————————————————————————————————————————————
// Les dates, à l'heure de Paris
// ————————————————————————————————————————————————————————————————————————————

const JOUR_DE_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const HEURE_DE_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const JOUR_EN_LETTRES = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
});

/** « 22 h 15 » : l'heure à la française. */
export function heureDeParis(date: Date): string {
  const [h, m] = HEURE_DE_PARIS.format(date).split(':');
  return `${Number(h)} h ${m}`;
}

/** « Aujourd’hui, 22 h 15 », « Hier, 18 h 10 », « 20 nov., 17 h 40 ». */
export function quand(iso: string, maintenant: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jour = (x: Date) => JOUR_DE_PARIS.format(x);
  const heure = heureDeParis(d);
  if (jour(d) === jour(new Date(maintenant))) return `Aujourd’hui, ${heure}`;
  if (jour(d) === jour(new Date(maintenant - 24 * 60 * 60 * 1000))) return `Hier, ${heure}`;
  return `${JOUR_EN_LETTRES.format(d)}, ${heure}`;
}

/** « 18 nov. » */
export function jourCourt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : JOUR_EN_LETTRES.format(d);
}

/** Les initiales, pour un portrait sans photo. */
export function initialesDe(prenom: string | null, nom: string | null): string {
  return `${(prenom ?? '').trim().charAt(0)}${(nom ?? '').trim().charAt(0)}`.toUpperCase() || '·';
}
