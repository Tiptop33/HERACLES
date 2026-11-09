import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Variables } from './balisage';
import { enTete, tableauDesOffres, type Offre } from './affiche';
import { enPdf, titreDuCompteRendu } from './archives';
import { prochaineReunion, type Report } from './calendrier';
import {
  couper,
  dateAbregee,
  dateLongue,
  jourCourt,
  jourEntier,
  variablesDeLaCommission,
  type Commission,
} from './formats';
import { blocOuVide, blocTexte, cellule, tableau } from './mise-en-forme';
import type { Lecteur } from './reglages';
import { telephone } from '../format';

/**
 * Le compte rendu des travaux de la commission, tel que Bubble le sortait
 * après chaque réunion.
 *
 *   · page 1 — l'en-tête, la présentation, les **présences** du jour avec le
 *     taux de chacun sur l'exercice, la prochaine réunion ;
 *   · page 2 et suivantes — la **liste des candidats** en cours, avec la
 *     dernière remarque du journal de suivi, puis les offres.
 *
 * Il reste entre les mains de la commission : il porte les noms, les
 * coordonnées des référents, les commentaires. Il ne circule pas comme
 * l'affiche.
 */

export type LignePresence = {
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  /** Présent, Excusé, Absent — ou `null` : jamais appelé. */
  etat: string | null;
  presences: number;
  taux: number;
};

export type DossierCompteRendu = {
  numero: number | null;
  ouvert_le: string | null;
  /** La définition de l'emploi : la ligne en gras, coupée. */
  definition_emploi: string | null;
  /** L'intitulé tel que la personne l'a écrit : la ligne en italique. */
  emploi_recherche: string | null;
  metier_libelle: string | null;
  nom: string | null;
  prenom: string | null;
  referent_nom: string | null;
  commentaire: string | null;
};

export type DonneesCompteRendu = {
  tenueLe: string;
  presences: LignePresence[];
  candidats: DossierCompteRendu[];
  offres: Offre[];
  commission: Commission & {
    lieu_reunions: string | null;
    nombre_dossiers: number | null;
    /** La réunion suivante si elle est déjà inscrite au registre. */
    prochaine_reunion: string | null;
  };
};

export function datePourLaProchaine(d: DonneesCompteRendu, report: Report): string | null {
  return d.commission.prochaine_reunion ?? prochaineReunion(d.tenueLe, report);
}

export function variablesDuCompteRendu(d: DonneesCompteRendu, report: Report): Variables {
  return {
    ...variablesDeLaCommission(d.commission),
    date: dateLongue(d.tenueLe),
    date_abregee: dateAbregee(d.tenueLe),
    nombre_dossiers: d.commission.nombre_dossiers ?? '',
    prochaine_date: jourEntier(datePourLaProchaine(d, report)),
    lieu: d.commission.lieu_reunions?.trim() ?? '',
  };
}

/** L'abréviation de la colonne « RÉUNION ». Jamais appelé : la case reste vide. */
export function marque(etat: string | null): '' | 'P' | 'E' | 'A' {
  if (etat === 'Présent') return 'P';
  if (etat === 'Excusé') return 'E';
  if (etat === 'Absent') return 'A';
  return '';
}

/** Le drapeau devant un numéro français, comme dans l'annuaire. */
const DRAPEAU =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="9" viewBox="0 0 15 10">' +
  '<rect x="0" y="0" width="5" height="10" fill="#0055a4"/>' +
  '<rect x="5" y="0" width="5" height="10" fill="#ffffff"/>' +
  '<rect x="10" y="0" width="5" height="10" fill="#ef4135"/></svg>';

export const IMAGES_DU_COMPTE_RENDU = ['entete.logo_gauche', 'entete.logo_droit'] as const;

export function definitionDuCompteRendu(
  d: DonneesCompteRendu,
  r: Lecteur,
  presentes: ReadonlySet<string>,
): TDocumentDefinitions {
  const report = r.choix('prochaine.report') as Report;
  const v = variablesDuCompteRendu(d, report);

  const couleurs: Record<string, string> = {
    P: r.couleur('presences.present'),
    A: r.couleur('presences.absent'),
    E: r.couleur('presences.excuse'),
  };
  const drapeau = r.oui('presences.drapeau');

  const content: Array<Content | null> = [
    enTete(r, v, presentes, [
      blocTexte(r, 'entete.obedience', v),
      blocTexte(r, 'entete.province', v),
      blocTexte(r, 'entete.commission', v),
    ]),
    blocTexte(r, 'mission', v),
  ];

  // —— Présences ——
  const titre = blocTexte(r, 'presences.titre', v);
  const sousTitre = blocTexte(r, 'presences.sous_titre', v);
  if (titre || sousTitre) {
    content.push({
      columns: [
        { width: 'auto', stack: titre ? [titre] : [] },
        { width: '*', stack: sousTitre ? [sousTitre] : [] },
      ],
    });
  }
  content.push(
    tableau<LignePresence>(
      r,
      'presences',
      [
        {
          cle: 'nom',
          cellule: (p, s) => cellule([p.nom, p.prenom].filter(Boolean).join(' '), s),
        },
        { cle: 'email', cellule: (p, s) => cellule(p.email, s) },
        {
          cle: 'telephone',
          cellule: (p, s) => {
            const tel = telephone(p.telephone);
            if (!tel) return cellule('', s);
            if (!drapeau || !tel.francais) return cellule(tel.affiche, s);
            return {
              columnGap: 5,
              columns: [
                { width: 13, svg: DRAPEAU, margin: [0, 1.5, 0, 0] },
                { width: '*', ...(cellule(tel.affiche, s) as ContentText) },
              ],
            } as Content;
          },
        },
        {
          cle: 'reunion',
          cellule: (p, s) => {
            const m = marque(p.etat);
            return cellule(m, { ...s, taille: r.nombre('presences.marque.taille'), gras: true }, m ? { color: couleurs[m] } : {});
          },
        },
        { cle: 'presence', cellule: (p, s) => cellule(String(p.presences), s) },
        { cle: 'taux', cellule: (p, s) => cellule(`${p.taux} %`, s) },
      ],
      d.presences,
    ),
  );

  // —— Prochaine réunion ——
  if (r.oui('prochaine.visible')) {
    const epaisseur = r.nombre('prochaine.epaisseur');
    const bordure = r.couleur('prochaine.bordure');
    const marge = r.nombre('prochaine.marge');
    content.push({
      margin: [0, r.nombre('prochaine.avant'), 0, 0],
      layout: {
        hLineWidth: () => epaisseur,
        vLineWidth: () => epaisseur,
        hLineColor: () => bordure,
        vLineColor: () => bordure,
        fillColor: () => r.couleur('prochaine.fond'),
        paddingTop: () => marge,
        paddingBottom: () => marge,
      },
      table: {
        widths: ['*'],
        body: [
          [
            {
              columns: [
                { width: '*', ...blocOuVide(r, 'prochaine.libelle', v) },
                { width: '*', ...blocOuVide(r, 'prochaine.date', v) },
                { width: '*', ...blocOuVide(r, 'prochaine.lieu', v) },
              ],
            },
          ],
        ],
      },
    } as Content);
  }
  content.push(blocTexte(r, 'avertissement', v));

  // —— Liste des candidats ——
  const longueur = r.nombre('candidats.emploi.longueur');
  const tailleDetail = r.nombre('candidats.emploi.taille');
  const couleurDetail = r.couleur('candidats.emploi.couleur');
  const candidats = [
    blocTexte(r, 'candidats.titre', v),
    tableau<DossierCompteRendu>(
      r,
      'candidats',
      [
        { cle: 'numero', cellule: (c, s) => cellule(c.numero === null ? '' : String(c.numero), s) },
        { cle: 'date', cellule: (c, s) => cellule(jourCourt(c.ouvert_le), s) },
        {
          cle: 'emploi',
          cellule: (c, s) => {
            const definition = couper(c.definition_emploi, longueur);
            const intitule = c.emploi_recherche?.trim() ?? '';
            const lignes: Content[] = [];
            if (definition) lignes.push(cellule(definition, { ...s, gras: true }) as Content);
            if (intitule) {
              lignes.push(cellule(intitule, { ...s, taille: tailleDetail }, { italics: true, color: couleurDetail }) as Content);
            }
            // Ni définition, ni intitulé : le métier, en clair, plutôt qu'une case vide.
            if (lignes.length === 0 && c.metier_libelle?.trim()) lignes.push(cellule(c.metier_libelle.trim(), s) as Content);
            return { stack: lignes };
          },
        },
        {
          cle: 'nom',
          cellule: (c, s) => ({
            stack: [
              cellule(c.nom, { ...s, gras: true }) as Content,
              ...(c.prenom ? [cellule(c.prenom, s) as Content] : []),
            ],
          }),
        },
        { cle: 'referent', cellule: (c, s) => cellule(c.referent_nom, s) },
        { cle: 'commentaire', cellule: (c, s) => cellule(c.commentaire, s) },
      ],
      d.candidats,
    ),
  ].filter((x): x is Content => x !== null);
  if (candidats.length > 0) {
    content.push({ stack: candidats, ...(r.oui('candidats.saut') ? { pageBreak: 'before' as const } : {}) });
  }

  // —— Offres ——
  if (r.oui('offres.visible')) {
    const longueurSociete = r.nombre('offres.societe.longueur');
    content.push(blocTexte(r, 'offres.titre', v));
    content.push(tableauDesOffres(r, d.offres, { couperSociete: (s) => couper(s, longueurSociete) }));
  }

  const margeGauche = r.nombre('pied.marge.gauche');
  const margeDroite = r.nombre('pied.marge.droite');

  return {
    pageSize: 'A4',
    pageMargins: [
      r.nombre('page.marge.gauche'),
      r.nombre('page.marge.haut'),
      r.nombre('page.marge.droite'),
      r.nombre('page.marge.bas'),
    ],
    defaultStyle: { font: r.choix('page.police') },
    info: { title: `Compte-rendu du ${v.date_abregee}`, creator: 'HERACLES', producer: 'HERACLES' },
    content: content.filter((x): x is Content => x !== null),
    footer: (page: number, pages: number) => {
      const vp: Variables = { ...v, page, pages };
      const pile = (...prefixes: string[]) => prefixes.map((p) => blocTexte(r, p, vp)).filter((x): x is ContentText => x !== null);
      return {
        margin: [margeGauche, 0, margeDroite, 0],
        stack: [
          {
            columns: [
              { width: '*', stack: pile('pied.gauche.nom', 'pied.gauche.fonction') },
              {
                width: '*',
                stack: pile('pied.centre.information', 'pied.centre.information_liste', 'pied.centre.action', 'pied.centre.action_liste'),
              },
              { width: '*', stack: pile('pied.droite.nom', 'pied.droite.fonction') },
            ],
          },
          ...pile('pied.pagination'),
        ],
      } as Content;
    },
  };
}

/**
 * « Compte-Rendu du 28-10-2026.pdf » — la date de la réunion. C'est aussi le
 * nom de l'exemplaire archivé (migration 0069), sans l'extension.
 */
export function nomDuCompteRendu(tenueLe: string): string {
  return enPdf(titreDuCompteRendu(tenueLe));
}
