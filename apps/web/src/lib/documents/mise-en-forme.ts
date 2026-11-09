import type { Content, ContentText, CustomTableLayout, TableCell } from 'pdfmake/interfaces';
import { remplir, type Morceau, type Variables } from './balisage';
import type { Lecteur } from './reglages';

/**
 * Les briques communes aux trois gabarits : un bloc de texte réglé, un tableau
 * réglé, une image réglée.
 *
 * Ce fichier traduit les réglages en nœuds pdfmake, et rien d'autre. Il ne lit
 * ni la base, ni le disque : les gabarits restent des fonctions pures,
 * éprouvables sans serveur.
 */

type Inline = { text: string; bold?: boolean; italics?: boolean; fontSize?: number; link?: string; color?: string; decoration?: 'underline' };

/** Une adresse e-mail, pour en faire un lien dans l'encadré des contacts. */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Les morceaux d'un texte, en fragments pdfmake. */
export function enLigne(
  morceaux: Morceau[],
  options: { capitales?: number; taille?: number; liens?: { couleur: string } } = {},
): Inline[] {
  const fragments: Inline[] = [];
  for (const m of morceaux) {
    const style = { ...(m.gras ? { bold: true } : {}), ...(m.italique ? { italics: true } : {}) };

    if (options.liens) {
      let dernier = 0;
      for (const trouve of m.texte.matchAll(EMAIL)) {
        const debut = trouve.index ?? 0;
        if (debut > dernier) fragments.push({ text: m.texte.slice(dernier, debut), ...style });
        fragments.push({
          text: trouve[0],
          ...style,
          link: `mailto:${trouve[0]}`,
          color: options.liens.couleur,
          decoration: 'underline',
        });
        dernier = debut + trouve[0].length;
      }
      if (dernier < m.texte.length) fragments.push({ text: m.texte.slice(dernier), ...style });
      continue;
    }

    // Les « petites capitales » de l'en-tête : la première lettre de chaque
    // mot plus grande que le reste — « GRANDE LOGE NATIONALE FRANCAISE ».
    if (options.capitales && options.taille && options.capitales !== options.taille) {
      for (const partie of m.texte.split(/(\s+)/)) {
        if (!partie) continue;
        if (/^\s+$/.test(partie)) {
          fragments.push({ text: partie, ...style });
          continue;
        }
        fragments.push({ text: partie.charAt(0), fontSize: options.capitales, ...style });
        if (partie.length > 1) fragments.push({ text: partie.slice(1), ...style });
      }
      continue;
    }

    fragments.push({ text: m.texte, ...style });
  }
  return fragments;
}

/**
 * Un bloc de texte tel que réglé : texte, taille, couleur, gras, italique,
 * alignement, espace avant, marge à gauche, retrait.
 *
 * Rend `null` quand le bloc est masqué, ou quand il ne reste rien à écrire —
 * `{lieu}` d'une loge qui n'en a pas : mieux vaut une ligne de moins qu'un
 * blanc à sa place.
 */
export function blocTexte(
  r: Lecteur,
  prefixe: string,
  variables: Variables,
  options: { liens?: { couleur: string }; sansMarge?: boolean } = {},
): ContentText | null {
  if (!r.oui(`${prefixe}.visible`)) return null;
  const morceaux = remplir(r.texte(`${prefixe}.texte`), variables);
  if (morceaux.length === 0) return null;

  const taille = r.nombre(`${prefixe}.taille`);
  const capitales = r.connait(`${prefixe}.capitales`) ? r.nombre(`${prefixe}.capitales`) : undefined;
  const gauche = r.connait(`${prefixe}.gauche`) ? r.nombre(`${prefixe}.gauche`) : 0;
  const droite = r.connait(`${prefixe}.droite`) ? r.nombre(`${prefixe}.droite`) : 0;
  const retrait = r.connait(`${prefixe}.retrait`) ? r.nombre(`${prefixe}.retrait`) : 0;

  const noeud: ContentText = {
    text: enLigne(morceaux, { capitales, taille, liens: options.liens }),
    fontSize: taille,
    color: r.couleur(`${prefixe}.couleur`),
    bold: r.oui(`${prefixe}.gras`),
    italics: r.oui(`${prefixe}.italique`),
    alignment: r.alignement(`${prefixe}.alignement`),
  };
  if (!options.sansMarge) noeud.margin = [gauche, r.nombre(`${prefixe}.avant`), droite, 0];
  if (retrait) noeud.leadingIndent = retrait;
  return noeud;
}

/** Le même bloc, ou un texte vide là où pdfmake exige un nœud (colonnes, cellules). */
export function blocOuVide(r: Lecteur, prefixe: string, variables: Variables): ContentText {
  return blocTexte(r, prefixe, variables) ?? { text: '' };
}

// ————————————————————————————————————————————————————————————————————————————
// Les tableaux
// ————————————————————————————————————————————————————————————————————————————

export type StyleDeCellule = { taille: number; gras: boolean; alignement: string };

export type DefinitionDeColonne<T> = {
  cle: string;
  cellule: (ligne: T, style: StyleDeCellule) => TableCell;
};

/** La mise en forme commune : filets fins, en-tête coloré, une ligne sur deux teintée. */
export function dispositionDeTableau(r: Lecteur, prefixe: string): CustomTableLayout {
  const fond = r.couleur(`${prefixe}.entete.fond`);
  const zebre = r.couleur(`${prefixe}.zebre`);
  const bordure = r.couleur(`${prefixe}.bordure`);
  const marge = r.nombre(`${prefixe}.marge`);
  return {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => bordure,
    vLineColor: () => bordure,
    paddingTop: () => marge,
    paddingBottom: () => marge,
    fillColor: (i: number) => (i === 0 ? fond : i % 2 === 0 && zebre !== '#ffffff' ? zebre : null),
  };
}

/**
 * Un tableau réglé : les colonnes visibles, dans l'ordre du gabarit, leurs
 * titres et largeurs, l'en-tête répété en haut de chaque page.
 *
 * `prefixe` désigne la section (« presences »), le style se lit sous
 * `<prefixe>.tableau`, les colonnes sous `<prefixe>.col.<cle>`.
 */
export function tableau<T>(
  r: Lecteur,
  prefixe: string,
  colonnes: Array<DefinitionDeColonne<T>>,
  lignes: T[],
): Content | null {
  const visibles = colonnes.filter((c) => r.oui(`${prefixe}.col.${c.cle}.visible`));
  if (visibles.length === 0) return null;

  const t = `${prefixe}.tableau`;
  const tailleEntete = r.nombre(`${t}.entete.taille`);
  const tailleCorps = r.nombre(`${t}.corps.taille`);
  const couleurEntete = r.couleur(`${t}.entete.couleur`);

  const entete: TableCell[] = visibles.map((c) => ({
    text: r.texte(`${prefixe}.col.${c.cle}.titre`),
    bold: true,
    fontSize: tailleEntete,
    color: couleurEntete,
    alignment: r.alignement(`${prefixe}.col.${c.cle}.alignement`),
  }));

  const corps: TableCell[][] = lignes.map((ligne) =>
    visibles.map((c) =>
      c.cellule(ligne, {
        taille: tailleCorps,
        gras: r.oui(`${prefixe}.col.${c.cle}.gras`),
        alignement: r.alignement(`${prefixe}.col.${c.cle}.alignement`),
      }),
    ),
  );

  return {
    margin: [0, r.nombre(`${t}.avant`), 0, 0],
    fontSize: tailleCorps,
    layout: dispositionDeTableau(r, t),
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: visibles.map((c) => r.largeur(`${prefixe}.col.${c.cle}.largeur`)),
      body: [entete, ...corps],
    },
  };
}

/** Une cellule de texte simple, au style de sa colonne. */
export function cellule(texte: string | null | undefined, style: StyleDeCellule, extra: Partial<ContentText> = {}): TableCell {
  return {
    text: texte ?? '',
    fontSize: style.taille,
    bold: style.gras,
    alignment: style.alignement as ContentText['alignment'],
    ...extra,
  } as TableCell;
}

// ————————————————————————————————————————————————————————————————————————————
// Les images
// ————————————————————————————————————————————————————————————————————————————

/**
 * Une image réglée, ou `null` si elle est masquée ou absente. `nom` est sa clé
 * dans le dictionnaire `images` du document.
 */
export function imageReglee(
  r: Lecteur,
  prefixe: string,
  presente: boolean,
  extra: { margin?: [number, number, number, number]; alignment?: 'left' | 'center' | 'right' } = {},
): Content | null {
  if (!presente || !r.oui(`${prefixe}.visible`)) return null;
  const largeur = r.nombre(`${prefixe}.largeur`);
  const hauteur = r.nombre(`${prefixe}.hauteur`);
  return {
    image: prefixe,
    width: largeur,
    ...(hauteur > 0 ? { height: hauteur } : {}),
    ...extra,
  } as Content;
}
