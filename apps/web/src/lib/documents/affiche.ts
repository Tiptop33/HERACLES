import type { Column, Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { remplir, retirerLesLignesVides, type Variables } from './balisage';
import { enPdf, titreDeLAffiche } from './archives';
import { dateLongue, jourEntier, variablesDeLaCommission, type Commission } from './formats';
import { blocTexte, cellule, enLigne, imageReglee, tableau } from './mise-en-forme';
import type { Lecteur } from './reglages';

/**
 * L'affiche de la commission : les dossiers en cours, sur une page, à afficher
 * et à faire circuler.
 *
 * Elle ne porte **aucun nom de candidat** — c'est sa raison d'être : le numéro
 * du dossier, sa date d'entrée, l'intitulé exact de ce que la personne cherche,
 * et le lien de son CV anonyme. Qui veut en savoir plus demande la fiche par
 * son numéro.
 *
 * En seconde page, comme chez Bubble : les offres remontées à la commission, et
 * l'encadré des contacts.
 */

export type DossierAffiche = {
  numero: number | null;
  ouvert_le: string | null;
  /** L'intitulé exact, tel que la personne l'a écrit. */
  intitule: string | null;
  /** L'adresse publique du CV anonyme, s'il y en a un. */
  lienCvAnonyme: string | null;
};

export type Offre = {
  ajoutee_le: string | null;
  poste: string | null;
  societe: string | null;
  ville: string | null;
  contact: string | null;
  email: string | null;
};

export type DonneesAffiche = {
  tenueLe: string;
  dossiers: DossierAffiche[];
  offres: Offre[];
  commission: Commission;
};

export function variablesDeLAffiche(d: DonneesAffiche): Variables {
  return {
    ...variablesDeLaCommission(d.commission),
    date: dateLongue(d.tenueLe),
    nombre: d.dossiers.length,
    s: d.dossiers.length > 1 ? 'S' : '',
  };
}

export const IMAGES_DE_L_AFFICHE = ['entete.logo_gauche', 'entete.logo_droit'] as const;

/** L'en-tête partagé par l'affiche et le compte rendu : deux emblèmes, l'obédience au milieu. */
export function enTete(r: Lecteur, v: Variables, presentes: ReadonlySet<string>, milieu: Array<Content | null>): Content {
  const colonnes: Column[] = [];
  const gauche = imageReglee(r, 'entete.logo_gauche', presentes.has('entete.logo_gauche'));
  const droite = imageReglee(r, 'entete.logo_droit', presentes.has('entete.logo_droit'));
  if (gauche) colonnes.push({ width: r.nombre('entete.logo_gauche.largeur'), stack: [gauche] });
  colonnes.push({ width: '*', stack: milieu.filter((x): x is Content => x !== null) });
  if (droite) colonnes.push({ width: r.nombre('entete.logo_droit.largeur'), stack: [droite] });
  return { margin: [0, r.nombre('entete.avant'), 0, 0], columns: colonnes };
}

export function tableauDesOffres(r: Lecteur, offres: Offre[], options: { couperSociete?: (s: string) => string } = {}): Content | null {
  const couper = options.couperSociete ?? ((s: string) => s);
  return tableau<Offre>(
    r,
    'offres',
    [
      { cle: 'date', cellule: (o, s) => cellule(jourEntier(o.ajoutee_le), s) },
      { cle: 'poste', cellule: (o, s) => cellule(o.poste, s) },
      { cle: 'societe', cellule: (o, s) => cellule(couper(o.societe ?? ''), s) },
      { cle: 'ville', cellule: (o, s) => cellule(o.ville, s) },
      { cle: 'contact', cellule: (o, s) => cellule(o.contact, s) },
      { cle: 'email', cellule: (o, s) => cellule(o.email, s) },
    ],
    offres,
  );
}

export function definitionDeLAffiche(
  d: DonneesAffiche,
  r: Lecteur,
  presentes: ReadonlySet<string>,
): TDocumentDefinitions {
  const v = variablesDeLAffiche(d);
  const lien = {
    texte: r.texte('dossiers.lien.texte'),
    couleur: r.couleur('dossiers.lien.couleur'),
    souligne: r.oui('dossiers.lien.souligne'),
  };

  const content: Array<Content | null> = [
    enTete(r, v, presentes, [blocTexte(r, 'entete.obedience', v), blocTexte(r, 'entete.province', v)]),
    blocTexte(r, 'titre', v),
    blocTexte(r, 'date', v),
    blocTexte(r, 'compte', v),
    blocTexte(r, 'mission', v),
    tableau<DossierAffiche>(
      r,
      'dossiers',
      [
        { cle: 'numero', cellule: (x, s) => cellule(x.numero === null ? '' : String(x.numero), s) },
        { cle: 'date', cellule: (x, s) => cellule(jourEntier(x.ouvert_le), s) },
        { cle: 'intitule', cellule: (x, s) => cellule(x.intitule?.trim() ?? '', s) },
        {
          cle: 'cv',
          // Le lien n'apparaît que s'il mène quelque part : un dossier sans CV
          // anonyme laisse la case vide, comme sur l'original.
          cellule: (x, s) =>
            x.lienCvAnonyme
              ? cellule(lien.texte, s, {
                  link: x.lienCvAnonyme,
                  color: lien.couleur,
                  ...(lien.souligne ? { decoration: 'underline' as const } : {}),
                })
              : cellule('', s),
        },
      ],
      d.dossiers,
    ),
  ];

  // —— Les offres ——
  if (r.oui('offres.visible')) {
    const titre = blocTexte(r, 'offres.titre', v);
    const table = tableauDesOffres(r, d.offres);
    const bloc = [titre, table].filter((x): x is Content => x !== null);
    if (bloc.length > 0) {
      content.push({ stack: bloc, ...(r.oui('offres.saut') ? { pageBreak: 'before' as const } : {}) });
    }
  }

  // —— Les contacts ——
  if (r.oui('contacts.visible')) {
    const contacts = encadreDesContacts(r, v);
    if (contacts) content.push(contacts);
  }

  return {
    pageSize: 'A4',
    pageMargins: [
      r.nombre('page.marge.gauche'),
      r.nombre('page.marge.haut'),
      r.nombre('page.marge.droite'),
      r.nombre('page.marge.bas'),
    ],
    defaultStyle: { font: r.choix('page.police') },
    info: { title: `Affiche du ${v.date}`, creator: 'HERACLES', producer: 'HERACLES' },
    content: content.filter((x): x is Content => x !== null),
  };
}

/**
 * L'encadré des contacts : une ligne par contact, les adresses en liens.
 *
 * Chaque ligne est un nœud à part, pour porter son espace avant : c'est ainsi
 * que l'original les espace.
 */
function encadreDesContacts(r: Lecteur, v: Variables): Content | null {
  const titre = blocTexte(r, 'contacts.titre', v);
  const lignes: Content[] = [];
  if (r.oui('contacts.lignes.visible')) {
    const modele = retirerLesLignesVides(r.texte('contacts.lignes.texte'), v);
    for (const ligne of modele.split('\n')) {
      const morceaux = remplir(ligne, v);
      if (morceaux.length === 0) continue;
      lignes.push({
        text: enLigne(morceaux, { liens: { couleur: r.couleur('contacts.lien') } }),
        fontSize: r.nombre('contacts.lignes.taille'),
        color: r.couleur('contacts.lignes.couleur'),
        bold: r.oui('contacts.lignes.gras'),
        italics: r.oui('contacts.lignes.italique'),
        alignment: r.alignement('contacts.lignes.alignement'),
        margin: [0, r.nombre('contacts.lignes.avant'), 0, 0],
      });
    }
  }
  if (!titre && lignes.length === 0) return null;

  const fond = r.couleur('contacts.fond');
  const bordure = r.couleur('contacts.bordure');
  // La largeur réglée est celle du cadre, filets compris ; la cellule en
  // retire ses marges et ses filets.
  const largeur = Math.max(10, r.nombre('contacts.largeur') - 24.5);
  return {
    margin: [0, r.nombre('contacts.avant'), 0, 0],
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => bordure,
      vLineColor: () => bordure,
      fillColor: () => fond,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 8,
      paddingBottom: () => 10,
    },
    table: {
      widths: [largeur],
      body: [[{ stack: [titre ? { ...titre, margin: [0, titre.margin ? (titre.margin as number[])[1] : 0, 0, 2] } : null, ...lignes].filter((x) => x !== null) as Content[] }]],
    },
  };
}

/**
 * « Affiche du 28-10-2026.pdf » — la date de la réunion. C'est aussi le nom de
 * l'exemplaire archivé (migration 0069), sans l'extension.
 */
export function nomDeLAffiche(tenueLe: string): string {
  return enPdf(titreDeLAffiche(tenueLe));
}
