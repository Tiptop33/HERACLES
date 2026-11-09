import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Variables } from './balisage';
import { article, nomDeFichierSur, variablesDeLaCommission, type Commission } from './formats';
import { blocTexte, imageReglee } from './mise-en-forme';
import { qrCode } from './qr';
import type { Lecteur } from './reglages';

/**
 * L'affichette : un dossier, une page, faite pour circuler.
 *
 * C'est le dossier du mois, celui que la commission choisit en réunion — le 2e
 * ou le 4e mercredi — pour le mettre en avant auprès de toute la province. Elle
 * reprend la page de Bubble : la cordelière, les deux colonnes, le texte
 * d'appel, le numéro encadré, ce que la personne recherche, son rayon
 * d'action, la signature du président de la commission et le QR code du CV
 * anonyme.
 *
 * Elle ne porte **aucun nom de candidat** : le numéro suffit à revenir vers la
 * commission. Le QR code ne mène qu'au CV anonyme, et s'éteint quand le dossier
 * se referme (migration 0067).
 */

export type DonneesAffichette = {
  numero: number | null;
  /** Emploi, stage, alternance. */
  type_emploi: string | null;
  /** L'intitulé exact, tel que la personne l'a écrit. */
  emploi_recherche: string | null;
  metier_libelle: string | null;
  /** Le rayon d'action : Agglomération, Départementale… */
  mobilite_geographique: string | null;
  commission: Commission;
  /** L'adresse publique du CV anonyme, ou `null` s'il n'y en a pas. */
  lienCvAnonyme: string | null;
};

export function variablesDeLAffichette(d: DonneesAffichette): Variables {
  return {
    ...variablesDeLaCommission(d.commission),
    numero: d.numero ?? '',
    article: article(d.type_emploi),
    type: (d.type_emploi ?? '').trim().toLocaleLowerCase('fr-FR'),
    intitule: (d.emploi_recherche?.trim() || d.metier_libelle?.trim()) ?? '',
    rayon: d.mobilite_geographique?.trim() ?? '',
  };
}

/** Les emplacements d'image de l'affichette, dans l'ordre du gabarit. */
export const IMAGES_DE_L_AFFICHETTE = ['decor.cordeliere', 'decor.colonne', 'decor.embleme_gauche', 'decor.embleme_droit'] as const;

export function definitionDeLAffichette(
  d: DonneesAffichette,
  r: Lecteur,
  presentes: ReadonlySet<string>,
): TDocumentDefinitions {
  const v = variablesDeLAffichette(d);
  const largeurColonne = r.nombre('decor.colonne.largeur');

  const cote = (embleme: 'decor.embleme_gauche' | 'decor.embleme_droit'): Column => ({
    width: largeurColonne,
    stack: [
      imageReglee(r, 'decor.colonne', presentes.has('decor.colonne')),
      imageReglee(r, embleme, presentes.has(embleme), { margin: [0, r.nombre(`${embleme}.avant`), 0, 0] }),
    ].filter((x): x is Content => x !== null),
  });

  // Le numéro, encadré comme sur l'original : un tableau d'une cellule.
  const numero = blocTexte(r, 'dossier', v, { sansMarge: true });
  let blocNumero: Content | null = null;
  if (numero) {
    const interieur = r.nombre('dossier.cadre.marge');
    if (r.oui('dossier.cadre')) {
      const epaisseur = r.nombre('dossier.cadre.epaisseur');
      const couleur = r.couleur('dossier.cadre.couleur');
      blocNumero = {
        margin: [0, r.nombre('dossier.avant'), 0, 0],
        layout: {
          hLineWidth: () => epaisseur,
          vLineWidth: () => epaisseur,
          hLineColor: () => couleur,
          vLineColor: () => couleur,
        },
        table: { widths: ['*'], body: [[{ ...numero, margin: [0, interieur, 0, interieur] }]] },
      };
    } else {
      blocNumero = { ...numero, margin: [0, r.nombre('dossier.avant'), 0, 0] };
    }
  }

  // Le QR code n'existe que s'il y a un CV anonyme : jamais de code vers rien.
  const qr: Content[] = [];
  if (d.lienCvAnonyme && r.oui('qr.visible')) {
    qr.push({
      stack: [qrCode(d.lienCvAnonyme, r.nombre('qr.taille'), r.couleur('qr.couleur'))],
      margin: [0, r.nombre('qr.avant'), 0, 0],
    });
    const legende = blocTexte(r, 'qr.legende', v);
    if (legende) qr.push(legende);
  }

  const milieu: Content[] = [
    blocTexte(r, 'salutation', v),
    blocTexte(r, 'appel', v),
    blocTexte(r, 'transition', v),
    blocNumero,
    blocTexte(r, 'recherche', v),
    blocTexte(r, 'intitule', v),
    blocTexte(r, 'rayon', v),
    blocTexte(r, 'signature', v),
    ...qr,
  ].filter((x): x is Content => x !== null);

  const content: Content[] = [];
  const cordeliere = imageReglee(r, 'decor.cordeliere', presentes.has('decor.cordeliere'), { alignment: 'center' });
  if (cordeliere) content.push(cordeliere);
  content.push({
    margin: [0, r.nombre('decor.colonne.avant'), 0, 0],
    columnGap: r.nombre('decor.gouttiere'),
    columns: [cote('decor.embleme_gauche'), { width: '*', stack: milieu }, cote('decor.embleme_droit')],
  });

  return {
    pageSize: 'A4',
    pageMargins: [
      r.nombre('page.marge.gauche'),
      r.nombre('page.marge.haut'),
      r.nombre('page.marge.droite'),
      r.nombre('page.marge.bas'),
    ],
    defaultStyle: { font: r.choix('page.police') },
    info: { title: `Dossier ${d.numero ?? ''}`.trim(), creator: 'HERACLES', producer: 'HERACLES' },
    content,
  };
}

/** « 856_du_06-11-2026.pdf », comme les affichettes de Bubble. */
export function nomDeLAffichette(numero: number | null, le: Date = new Date()): string {
  const jour = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  })
    .format(le)
    .replace(/\//g, '-');
  return nomDeFichierSur(`${numero ?? 'dossier'}_du_${jour}.pdf`);
}
