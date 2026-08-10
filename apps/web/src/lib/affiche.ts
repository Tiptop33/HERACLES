import type { Dossier } from './dossiers';
import { dateEnLettres } from './format';
import { Feuille, lisible, type Colonne } from './pdf';

/**
 * L'affiche de la commission : les dossiers ouverts, sur une page, à afficher.
 *
 * C'est le document qui **circule**. Il ne porte donc aucun nom de candidat :
 * la date d'entrée du dossier, l'intitulé de ce que la personne cherche, son
 * numéro, et la mention « CV » quand un curriculum est joint. Qui veut en
 * savoir plus demande la fiche par son numéro, à la commission.
 *
 * Cette discrétion n'est pas une politesse, c'est la raison d'être du numéro.
 * Une affiche qui nommerait les gens ferait exactement ce que l'application
 * d'origine faisait de leurs fiches : les exposer à qui passe.
 *
 * Le pied porte les coordonnées de la commission, lues dans les réglages
 * (migration 0056). Elles ne sont pas livrées avec l'application, et l'affiche
 * s'imprime sans elles plutôt qu'avec celles d'un autre.
 */

/** Voir `compte-rendu.ts` : ces trois lignes iront aux réglages du lot 5. */
const OBEDIENCE = 'GRANDE LOGE NATIONALE FRANÇAISE';
const PROVINCE = 'GRANDE LOGE PROVINCIALE DE GUYENNE ET GASCOGNE';
const MISSION =
  'La Commission « HERACLES » a pour mission d’apporter aide et soutien aux Frères, ' +
  'épouses de Frères et enfants de Frères en recherche d’emploi. La commission n’a pas ' +
  'vocation à se substituer au candidat en recherche, mais plutôt de faciliter la ' +
  'circulation des informations sur les postes à pourvoir et les offres d’emploi qui ' +
  'lui sont remontées.';

/** La date en chiffres, comme sur l'affiche : 18/06/2025, année entière. */
export function jourEntier(valeur: string | null): string {
  if (!valeur) return '';
  const [a, m, j] = valeur.slice(0, 10).split('-');
  return a && m && j ? `${j}/${m}/${a}` : '';
}

/**
 * Ce que l'affiche imprime d'un dossier : le long, celui que la personne a
 * écrit, et le court en secours. Jamais le nom.
 */
export function intitule(dossier: Dossier): string {
  const long = dossier.recherche?.trim();
  const court = dossier.emploi?.trim();
  return long || court || 'Recherche en cours';
}

export async function construireAffiche(options: {
  tenueLe: string;
  loge: string | null;
  dossiers: Dossier[];
  contacts: string[];
}): Promise<Uint8Array> {
  const { tenueLe, loge, dossiers, contacts } = options;
  const feuille = await Feuille.ouvrir();

  feuille.centre(OBEDIENCE, { taille: 9, gras: false });
  feuille.centre(PROVINCE, { taille: 9, gras: false });
  feuille.espace(4);
  feuille.centre(`COMMISSION EMPLOI « HERACLES »${loge ? ` — ${loge}` : ''}`, { taille: 14 });
  // `dateEnLettres` rend `null` sur une date illisible ; la date brute vaut
  // mieux qu'un titre amputé sur un document qu'on affiche.
  feuille.centre(dateEnLettres(tenueLe) ?? tenueLe, { taille: 10, gras: false });

  feuille.espace(8);
  feuille.texte(MISSION, { taille: 8, interligne: 11 });
  feuille.trait();

  feuille.espace(6);
  feuille.centre(
    `${dossiers.length} DOSSIER${dossiers.length > 1 ? 'S' : ''} EN SOUFFRANCE`,
    { taille: 12 },
  );
  feuille.espace(6);

  const colonnes: Colonne[] = [
    { titre: 'DATE', largeur: 62 },
    { titre: 'FRÈRES EN RECHERCHE D’EMPLOI OU DE STAGES', largeur: 355 },
    { titre: 'N°', largeur: 40, aligne: 'droite' },
    { titre: 'CV', largeur: 70, aligne: 'droite' },
  ];

  feuille.tableau(
    colonnes,
    dossiers.map((d) => [
      jourEntier(d.ouvert_le),
      intitule(d),
      d.numero === null ? '' : String(d.numero),
      d.a_un_cv ? 'CV' : '',
    ]),
    8.5,
  );

  if (dossiers.length === 0) {
    feuille.espace(4);
    feuille.texte('Aucun dossier en cours à ce jour.', { taille: 9 });
  }

  // Le pied. Il ne s'imprime que si l'installation a posé ses coordonnées :
  // une affiche sans pied se remarque, une affiche portant celles d'un autre
  // ne se remarque pas.
  if (contacts.length > 0) {
    feuille.espace(10);
    feuille.trait();
    feuille.espace(2);
    for (const ligne of contacts) {
      feuille.texte(ligne, { taille: 8, interligne: 11 });
    }
  }

  return feuille.fermer();
}

export function nomDeLAffiche(tenueLe: string): string {
  return `affiche-${lisible(tenueLe).slice(0, 10)}.pdf`;
}
