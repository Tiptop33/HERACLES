import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * De quoi poser du texte et des tableaux sur une page A4.
 *
 * `pdf-lib` sait dessiner un mot à une position ; tout le reste — aller à la
 * ligne, tenir un tableau, changer de page quand le bas approche — est à
 * écrire. C'est ce que fait ce fichier, et rien de plus : aucune connaissance
 * des documents d'HERACLES ne doit y entrer.
 *
 * POURQUOI PAS UNE PAGE IMPRIMABLE
 *
 * Le choix a été posé : un vrai fichier, que le serveur produit et qu'on peut
 * joindre à un envoi. Une page imprimable n'aurait rien coûté, mais elle exige
 * un humain devant un navigateur — et le compte rendu part par courriel.
 *
 * CE QUE LES POLICES SAVENT ÉCRIRE
 *
 * Les polices standard du PDF sont encodées en WinAnsi : un caractère hors de
 * ce jeu fait **échouer** le dessin, et donc toute la requête. Les données
 * viennent de Bubble et d'une saisie libre — il y traîne des espaces
 * insécables fins, des guillemets tordus, parfois un émoji. Tout passe donc
 * par `lisible()` avant d'être posé sur la page.
 */

export const A4 = { largeur: 595.28, hauteur: 841.89 };

/** Le gris du corps de texte, et le bleu des titres — sobres, pour du papier. */
const ENCRE = rgb(0.09, 0.13, 0.18);
const ENCRE_DOUCE = rgb(0.35, 0.42, 0.5);
const TRAIT = rgb(0.78, 0.82, 0.87);
const BANDEAU = rgb(0.93, 0.95, 0.97);

/** Les caractères que WinAnsi ajoute au Latin-1, et qu'on garde tels quels. */
const EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/**
 * Ce qu'on remplace plutôt que de le perdre — et rien d'autre.
 *
 * La liste est courte à dessein : WinAnsi sait déjà écrire les guillemets
 * courbes, les deux tirets et les points de suspension. Les rabattre sur leurs
 * équivalents ASCII abîmerait une typographie que le jeu de caractères
 * accepte. Ne sont traités ici que les signes qu'il ignore vraiment.
 */
const REMPLACEMENTS: Array<[RegExp, string]> = [
  // Espaces insécables, fines, tabulaires : invisibles, mais hors du jeu.
  [/[\u00a0\u202f\u2007\u2009\u200a]/g, ' '],
  // Traits d'union typographiques et signe moins, que WinAnsi ne connaît pas.
  [/[\u2010\u2011\u2212]/g, '-'],
  [/[\u201b\u2032]/g, '\u2019'],
  [/[\u2033]/g, '"'],
  // Espace de largeur nulle : invisible, sans emploi, et hors du jeu.
  [/\u200b/g, ''],
  [/\r\n?/g, '\n'],
];

/**
 * Ce que la police saura écrire. Un caractère qu'elle ignore est retiré, pas
 * remplacé par un losange : un compte rendu troué se relit, un compte rendu
 * qui ne s'imprime pas ne se relit pas.
 */
export function lisible(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  let texte = String(valeur).normalize('NFC');
  for (const [motif, par] of REMPLACEMENTS) texte = texte.replace(motif, par);

  let sortie = '';
  for (const c of texte) {
    const code = c.codePointAt(0) ?? 0;
    const connu =
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRAS.includes(c);
    if (connu) sortie += c;
  }
  return sortie;
}

export type Colonne = {
  titre: string;
  /** En points. La somme des largeurs fait la largeur utile de la page. */
  largeur: number;
  aligne?: 'gauche' | 'droite';
};

type Options = {
  taille?: number;
  gras?: boolean;
  couleur?: ReturnType<typeof rgb>;
  interligne?: number;
};

export class Feuille {
  private page!: PDFPage;
  private y = 0;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly normale: PDFFont,
    private readonly grasse: PDFFont,
    private readonly marge: number,
  ) {}

  static async ouvrir(marge = 34): Promise<Feuille> {
    const doc = await PDFDocument.create();
    const feuille = new Feuille(
      doc,
      await doc.embedFont(StandardFonts.Helvetica),
      await doc.embedFont(StandardFonts.HelveticaBold),
      marge,
    );
    feuille.nouvellePage();
    return feuille;
  }

  get largeurUtile(): number {
    return A4.largeur - 2 * this.marge;
  }

  nouvellePage(): void {
    this.page = this.doc.addPage([A4.largeur, A4.hauteur]);
    this.y = A4.hauteur - this.marge;
  }

  /** Descend de `hauteur`, en changeant de page si le bas est atteint. */
  private place(hauteur: number): number {
    if (this.y - hauteur < this.marge) this.nouvellePage();
    this.y -= hauteur;
    return this.y;
  }

  espace(points: number): void {
    this.place(points);
  }

  private police(gras: boolean): PDFFont {
    return gras ? this.grasse : this.normale;
  }

  /** Coupe un texte aux mots, pour qu'il tienne dans `largeur`. */
  couper(texte: string, largeur: number, taille: number, gras = false): string[] {
    const police = this.police(gras);
    const lignes: string[] = [];

    for (const paragraphe of lisible(texte).split('\n')) {
      let ligne = '';
      for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (police.widthOfTextAtSize(essai, taille) <= largeur) {
          ligne = essai;
          continue;
        }
        if (ligne) lignes.push(ligne);
        // Un mot plus large que la colonne : on le coupe, faute de mieux.
        ligne = mot;
        while (police.widthOfTextAtSize(ligne, taille) > largeur && ligne.length > 1) {
          let coupe = ligne.length - 1;
          while (coupe > 1 && police.widthOfTextAtSize(ligne.slice(0, coupe), taille) > largeur) {
            coupe -= 1;
          }
          lignes.push(ligne.slice(0, coupe));
          ligne = ligne.slice(coupe);
        }
      }
      lignes.push(ligne);
    }
    return lignes.length ? lignes : [''];
  }

  texte(valeur: string, options: Options = {}): void {
    const taille = options.taille ?? 9;
    const interligne = options.interligne ?? taille + 3;
    for (const ligne of this.couper(valeur, this.largeurUtile, taille, options.gras)) {
      const y = this.place(interligne);
      this.page.drawText(ligne, {
        x: this.marge,
        y,
        size: taille,
        font: this.police(options.gras ?? false),
        color: options.couleur ?? ENCRE,
      });
    }
  }

  /** Un titre centré, comme en tête des documents de la commission. */
  centre(valeur: string, options: Options = {}): void {
    const taille = options.taille ?? 11;
    const police = this.police(options.gras ?? true);
    const ligne = lisible(valeur);
    const y = this.place(options.interligne ?? taille + 5);
    const largeur = police.widthOfTextAtSize(ligne, taille);
    this.page.drawText(ligne, {
      x: (A4.largeur - largeur) / 2,
      y,
      size: taille,
      font: police,
      color: options.couleur ?? ENCRE,
    });
  }

  trait(): void {
    const y = this.place(8);
    this.page.drawLine({
      start: { x: this.marge, y: y + 4 },
      end: { x: A4.largeur - this.marge, y: y + 4 },
      thickness: 0.6,
      color: TRAIT,
    });
  }

  /**
   * Un tableau. L'en-tête se redessine en haut de chaque page : une colonne
   * sans son titre, trois pages plus loin, ne veut plus rien dire.
   */
  tableau(colonnes: Colonne[], lignes: string[][], taille = 8): void {
    const enTete = () => {
      const hauteur = taille + 8;
      if (this.y - hauteur < this.marge) this.nouvellePage();
      const y = this.place(hauteur);
      this.page.drawRectangle({
        x: this.marge,
        y: y - 2,
        width: this.largeurUtile,
        height: hauteur,
        color: BANDEAU,
      });
      let x = this.marge;
      for (const c of colonnes) {
        this.page.drawText(lisible(c.titre), {
          x: x + 3,
          y: y + 3,
          size: taille - 0.5,
          font: this.grasse,
          color: ENCRE_DOUCE,
        });
        x += c.largeur;
      }
    };

    enTete();

    for (const ligne of lignes) {
      // La hauteur de la ligne est celle de sa cellule la plus haute.
      const cellules = colonnes.map((c, i) =>
        this.couper(ligne[i] ?? '', c.largeur - 6, taille),
      );
      const hauteur = Math.max(...cellules.map((c) => c.length)) * (taille + 2.5) + 4;

      if (this.y - hauteur < this.marge) {
        this.nouvellePage();
        enTete();
      }

      const haut = this.y;
      this.place(hauteur);

      let x = this.marge;
      cellules.forEach((cellule, i) => {
        const colonne = colonnes[i];
        cellule.forEach((mot, rang) => {
          const y = haut - (rang + 1) * (taille + 2.5);
          const decalage =
            colonne.aligne === 'droite'
              ? colonne.largeur - 3 - this.normale.widthOfTextAtSize(mot, taille)
              : 3;
          this.page.drawText(mot, {
            x: x + decalage,
            y,
            size: taille,
            font: this.normale,
            color: ENCRE,
          });
        });
        x += colonne.largeur;
      });

      this.page.drawLine({
        start: { x: this.marge, y: this.y + 1 },
        end: { x: A4.largeur - this.marge, y: this.y + 1 },
        thickness: 0.4,
        color: TRAIT,
      });
    }
  }

  /** Numérote les pages, puis rend les octets. */
  async fermer(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const mention = `${i + 1} / ${pages.length}`;
      const largeur = this.normale.widthOfTextAtSize(mention, 7.5);
      page.drawText(mention, {
        x: A4.largeur - this.marge - largeur,
        y: this.marge - 12,
        size: 7.5,
        font: this.normale,
        color: ENCRE_DOUCE,
      });
    });
    return this.doc.save();
  }
}

export { ENCRE_DOUCE };
