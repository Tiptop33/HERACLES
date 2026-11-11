import type { Exercice } from '../exercice';
import { dateLongue } from './formats';

/**
 * Les PDF archivés de la commission — compte rendu, affiche, affichette —, et
 * ce qu'en montre l'accueil (migration 0069).
 *
 * Ce module ne contient que des fonctions pures : les noms, la période, le
 * rangement en trois colonnes. Le dépôt dans le seau est dans `archiver.ts`.
 */

/** Les trois sortes, avec les mots de Bubble (`Type_doc`), repris tels quels. */
export const SORTES = ['compte-rendu', 'affiche', 'affichette'] as const;
export type Sorte = (typeof SORTES)[number];

export function estUneSorte(valeur: unknown): valeur is Sorte {
  return typeof valeur === 'string' && (SORTES as readonly string[]).includes(valeur);
}

/**
 * L'en-tête de chaque colonne, et ce qu'elle dit quand elle est vide — à
 * l'accueil (l'exercice en cours) et dans Paramètres › Archives (ceux d'avant).
 */
export const COLONNES: Record<Sorte, { titre: string; vide: string; videAvant: string }> = {
  'compte-rendu': {
    titre: 'Compte-rendu',
    vide: 'Aucun compte-rendu sur la période.',
    videAvant: 'Aucun compte-rendu des exercices précédents.',
  },
  affiche: {
    titre: 'Affiche',
    vide: 'Aucune affiche sur la période.',
    videAvant: 'Aucune affiche des exercices précédents.',
  },
  affichette: {
    titre: 'Affichette',
    vide: 'Aucune affichette sur la période.',
    videAvant: 'Aucune affichette des exercices précédents.',
  },
};

/** Où l'on regarde les PDF : l'accueil, ou l'onglet des exercices précédents. */
export const ADRESSES = [
  '/espace/accueil',
  '/espace/documents',
  '/espace/parametres/archives',
] as const;
export type Adresse = (typeof ADRESSES)[number];

export function estUneAdresse(valeur: unknown): valeur is Adresse {
  return typeof valeur === 'string' && (ADRESSES as readonly string[]).includes(valeur);
}

const PARIS = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/**
 * « 28-10-2026 ».
 *
 * Une date civile « AAAA-MM-JJ » (celle d'une réunion) se lit telle quelle :
 * aucun fuseau ne doit la décaler. Un instant (`Date`) se lit à Paris — une
 * affichette tirée à 0 h 30 porte la date du jour qui commence, pas celle de
 * la veille en UTC.
 */
export function jourEnChiffres(le: string | Date): string {
  if (typeof le === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(le);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    le = new Date(le);
  }
  if (Number.isNaN(le.getTime())) return '';
  return PARIS.format(le).replace(/\//g, '-');
}

/** Le jour à Paris, en « AAAA-MM-JJ » — la forme des dates de la base. */
export function aujourdhuiAParis(maintenant: Date = new Date()): string {
  const [j, m, a] = PARIS.format(maintenant).split('/');
  return `${a}-${m}-${j}`;
}

/** « Compte-Rendu du 28-10-2026 » — la date de la réunion. */
export function titreDuCompteRendu(tenueLe: string): string {
  return `Compte-Rendu du ${jourEnChiffres(tenueLe)}`;
}

/** « Affiche du 28-10-2026 » — la date de la réunion. */
export function titreDeLAffiche(tenueLe: string): string {
  return `Affiche du ${jourEnChiffres(tenueLe)}`;
}

/** « 856 du 09-11-2026 » — le numéro du dossier et le jour où elle est tirée. */
export function titreDeLAffichette(numero: number | null, le: string | Date = new Date()): string {
  return `${numero ?? 'Dossier'} du ${jourEnChiffres(le)}`;
}

/** Le nom du fichier : le titre, et l'extension. */
export function enPdf(titre: string): string {
  return `${titre}.pdf`;
}

/** Deux bornes « AAAA-MM-JJ », comprises. */
export type Periode = { du: string; au: string };

/**
 * La période dont l'accueil montre les PDF : l'exercice réglé dans
 * Paramètres › Exercice — du 1er septembre au 31 juillet, en principe.
 *
 * Les bornes de l'onglet font foi dès qu'elles sont réglées, qu'aujourd'hui
 * tombe dedans ou non : c'est l'administration qui dit quel est l'exercice.
 * Tant qu'elles ne le sont pas, on prend la saison que l'accueil affiche déjà
 * en titre, plutôt que de ne rien montrer.
 */
export function periodeDesDocuments(exercice: Exercice, aujourdhui: string): Periode {
  const { debut, fin } = exercice;
  if (debut && fin) return { du: debut, au: fin };

  const annee = Number(aujourdhui.slice(0, 4));
  const mois = Number(aujourdhui.slice(5, 7));
  const depart = mois >= 9 ? annee : annee - 1;
  return { du: `${depart}-09-01`, au: `${depart + 1}-07-31` };
}

/** La veille d'une date « AAAA-MM-JJ », dans la même forme. */
export function veille(jour: string): string {
  const d = new Date(`${jour.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Tout ce qui précède une période : les exercices précédents, aussi loin que
 * remontent les PDF repris de Bubble. Paramètres › Archives les montre, quand
 * l'accueil ne montre que l'exercice en cours — les deux ne se recouvrent pas.
 */
export function avantLaPeriode(periode: Periode): Periode {
  return { du: '1900-01-01', au: veille(periode.du) };
}

/** Une ligne d'une colonne de l'accueil, telle que la rend `documents_de_l_accueil()`. */
export type DocumentArchive = {
  id: string;
  nom: string | null;
  type_document: Sorte;
  date_document: string;
  /** La base dit si la corbeille a lieu d'être sur cette ligne. */
  effacable: boolean;
};

/** Sans accents ni majuscules : « Février » se trouve en tapant « fevrier ». */
function aplatir(texte: string): string {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
}

/**
 * Ce sur quoi porte la recherche d'une ligne : son nom, et sa date en chiffres
 * comme en lettres. Les noms ne s'écrivent pas tous pareil — « Compte-Rendu du
 * 28-10-2026 » chez HERACLES, « Compte-rendu du Mercredi 14 Octobre 2026 » ou
 * « 812_du_09-07-2026 » chez Bubble — : avec la date sous ses deux formes,
 * « octobre » et « 10-2026 » trouvent les deux.
 */
function texteCherchable(d: DocumentArchive): string {
  return aplatir(
    [d.nom ?? '', jourEnChiffres(d.date_document), dateLongue(d.date_document)].join(' '),
  ).replace(/_/g, ' ');
}

/**
 * Les lignes d'une colonne qui répondent à la recherche : chaque mot tapé doit
 * s'y trouver, dans n'importe quel ordre. Une date tapée avec des barres ou
 * des points (« 09/07/2026 ») se lit comme avec des tirets.
 */
export function chercherDansLaColonne(
  lignes: readonly DocumentArchive[],
  recherche: string,
): DocumentArchive[] {
  return lignes.filter((d) => correspond(texteCherchable(d), recherche));
}

/**
 * Vrai si chaque mot de la recherche se trouve dans le texte, dans n'importe
 * quel ordre, sans accents ni majuscules. Une recherche vide laisse tout
 * passer. Sert aux colonnes de PDF comme aux listes de candidats refermés.
 */
export function correspond(texte: string, recherche: string): boolean {
  const mots = aplatir(recherche).replace(/[/.]/g, '-').split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const cible = aplatir(texte).replace(/_/g, ' ');
  return mots.every((mot) => cible.includes(mot));
}

/**
 * Le nombre de PDF d'une colonne, à côté de son titre : « 50 », et pendant une
 * recherche « 2 sur 50 » — le total seul laisserait croire que la liste
 * réduite est complète.
 */
export function compteDeLaColonne(affiches: number, total: number): string {
  return affiches === total ? String(total) : `${affiches} sur ${total}`;
}

/** Le nombre de PDF des trois colonnes réunies — celui du bouton « Archives ». */
export function totalDesColonnes(colonnes: Record<Sorte, readonly DocumentArchive[]>): number {
  return SORTES.reduce((total, sorte) => total + colonnes[sorte].length, 0);
}

/**
 * Les lignes rangées dans leurs trois colonnes, dans l'ordre reçu — la base
 * les rend du plus récent au plus ancien. Une sorte inconnue n'entre nulle
 * part : la colonne ne montre que ce qu'elle annonce.
 */
export function rangerParSorte(lignes: readonly DocumentArchive[]): Record<Sorte, DocumentArchive[]> {
  const colonnes: Record<Sorte, DocumentArchive[]> = {
    'compte-rendu': [],
    affiche: [],
    affichette: [],
  };
  for (const ligne of lignes) {
    if (estUneSorte(ligne.type_document)) colonnes[ligne.type_document].push(ligne);
  }
  return colonnes;
}

/**
 * Ce que la route d'effacement répond quand elle refuse. Un **code** dans
 * l'adresse, jamais le message : un message porté par l'URL est un message
 * qu'un lien fabriqué fait dire ce qu'il veut.
 */
const REFUS: Record<string, string> = {
  droit: 'Seuls l’administrateur, le Vénérable Maître et le Secrétaire peuvent effacer un PDF.',
  introuvable: 'Ce PDF n’existe plus, ou il n’est pas de votre loge.',
  session: 'Votre session a expiré. Reconnectez-vous.',
  echec: 'Le PDF n’a pas pu être effacé. Réessayez dans un instant.',
};

export function phraseDeRefusDocument(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUS[code] ?? REFUS.echec;
}
