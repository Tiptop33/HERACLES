import { correspond, jourEnChiffres } from './documents/archives';
import { dateLongue } from './documents/formats';

/**
 * Les candidats refermés de Paramètres › Archives — boutons « Candidat
 * Clôturé » et « Candidat Archivé » —, et la clôture d'un dossier
 * (migration 0071).
 *
 * Module pur, lu par le navigateur : la ligne arrive toute prête du serveur
 * (`enCandidatReferme()`, dans `poste.ts`), et la recherche se fait ici, à
 * chaque lettre tapée.
 */

/** Les deux listes, avec les mots des pastilles de l'écran Candidats. */
export const LISTES_REFERMEES = {
  'candidats-clotures': {
    vue: 'clotures',
    bouton: 'Candidat Clôturé',
    vide: 'Aucun candidat clôturé.',
    ferme: 'Clôturé le',
    inconnue: 'Date de clôture inconnue',
  },
  'candidats-archives': {
    vue: 'archives',
    bouton: 'Candidat Archivé',
    vide: 'Aucun candidat archivé.',
    ferme: 'Archivé le',
    inconnue: 'Date d’archivage inconnue',
  },
} as const;

export type ListeRefermee = keyof typeof LISTES_REFERMEES;

export function estUneListeRefermee(valeur: unknown): valeur is ListeRefermee {
  return typeof valeur === 'string' && Object.prototype.hasOwnProperty.call(LISTES_REFERMEES, valeur);
}

/**
 * Qui a refermé le dossier : les mots de la colonne CLOTURE de Bubble, tels
 * qu'ils y sont écrits (« Heraclés » compris), sans les virgules parasites de
 * « Autre ,,, ».
 */
export const MOTIFS_DE_CLOTURE = ['Lui-même', 'Heraclés', 'Autre'] as const;
export type MotifDeCloture = (typeof MOTIFS_DE_CLOTURE)[number];

export function estUnMotifDeCloture(valeur: unknown): valeur is MotifDeCloture {
  return typeof valeur === 'string' && (MOTIFS_DE_CLOTURE as readonly string[]).includes(valeur);
}

/** Une ligne, telle que l'écran Candidats la montre, et ses deux dates. */
export type CandidatReferme = {
  id: string;
  numero: number | null;
  /** « MARTIN Julie ». */
  nom: string;
  /** « Comptable · Bordeaux », ou vide. */
  sous: string;
  a_une_photo: boolean;
  initiales: string;
  /** Le liseré de gauche : emploi, alternance, stage, changement. */
  famille: string | null;
  /** La fiche, ouverte dans l'écran Candidats, sur la bonne pastille. */
  lien: string;
  /** La création du dossier. */
  cree_le: string | null;
  /** Sa clôture (liste des clôturés) ou son archivage (liste des archivés). */
  ferme_le: string | null;
  /** Vrai quand cette date vient de la dernière modification Bubble : « ≈ ». */
  ferme_estime: boolean;
};

/** Ce sur quoi porte la recherche : nom, prénom, n°, métier, ville, et les dates. */
function texteCherchable(c: CandidatReferme): string {
  const dates = [c.cree_le, c.ferme_le]
    .filter((d): d is string => Boolean(d))
    .map((d) => `${jourEnChiffres(d)} ${dateLongue(d)}`);
  return [c.nom, c.numero ?? '', c.sous, ...dates].join(' ');
}

/** Les candidats qui répondent à la recherche : chaque mot doit s'y trouver. */
export function chercherUnCandidat(
  lignes: readonly CandidatReferme[],
  recherche: string,
): CandidatReferme[] {
  return lignes.filter((c) => correspond(texteCherchable(c), recherche));
}
