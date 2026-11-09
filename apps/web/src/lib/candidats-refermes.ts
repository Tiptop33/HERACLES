import { correspond } from './documents/archives';

/**
 * Les candidats refermés de Paramètres › Archives — boutons « Candidat
 * Clôturé » et « Candidat Archivé ».
 *
 * Module pur, lu par le navigateur : la ligne arrive toute prête du serveur
 * (`enCandidatReferme()`, dans `poste.ts`), et la recherche se fait ici, à
 * chaque lettre tapée.
 */

/** Les deux listes, avec les mots des pastilles de l'écran Candidats. */
export const LISTES_REFERMEES = {
  'candidats-clotures': { vue: 'clotures', bouton: 'Candidat Clôturé', vide: 'Aucun candidat clôturé.' },
  'candidats-archives': { vue: 'archives', bouton: 'Candidat Archivé', vide: 'Aucun candidat archivé.' },
} as const;

export type ListeRefermee = keyof typeof LISTES_REFERMEES;

export function estUneListeRefermee(valeur: unknown): valeur is ListeRefermee {
  return typeof valeur === 'string' && Object.prototype.hasOwnProperty.call(LISTES_REFERMEES, valeur);
}

/** Une ligne, telle que l'écran Candidats la montre. */
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
};

/** Les candidats qui répondent à la recherche : nom, prénom, n°, métier, ville. */
export function chercherUnCandidat(
  lignes: readonly CandidatReferme[],
  recherche: string,
): CandidatReferme[] {
  return lignes.filter((c) => correspond(`${c.nom} ${c.numero ?? ''} ${c.sous}`, recherche));
}
