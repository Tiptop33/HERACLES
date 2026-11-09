import zlib from 'node:zlib';
import mammoth from 'mammoth';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { formatDImage } from './fichiers';

/**
 * Trouver, dans le CV du candidat, sa photo.
 *
 * Le partage des rôles :
 *
 *   · **le serveur de HERACLES** sort du fichier les images qui pourraient
 *     être une photo (`imagesDuCv`) ;
 *   · **Claude**, qui lit déjà le CV, les voit numérotées à la suite et
 *     désigne celle qui est la photo de la personne — ou aucune
 *     (`numeroDeLaPhoto`, dans `lecture-cv.ts`).
 *
 * Choisir sur la seule forme ne suffit pas : un QR code est carré, et il
 * était plus grand que la photo du premier CV essayé. Claude, lui, voit ce
 * qu'il y a sur l'image. Ces images font partie du CV qu'il lit déjà : rien
 * de plus ne part.
 *
 * Le candidat voit la photo avant d'envoyer sa fiche, et peut la refuser :
 * une erreur coûte un clic, jamais une photo rangée à son insu.
 *
 * Ce que l'on sait lire :
 *
 *   · un PDF — ses images en JPEG (`DCTDecode`), recopiées telles quelles ;
 *     et ses images en couleur ou en gris compressées autrement (`Flate`,
 *     `RunLength`, `LZW`…), reconstruites en PNG. Le 9 novembre, la photo
 *     d'un vrai CV était en `RunLength`, et seul son QR code était un JPEG.
 *     Ce qu'on ne sait pas reconstruire fidèlement — CMJN, palettes,
 *     JPEG 2000, masques — est laissé de côté : pas de photo, plutôt qu'une
 *     image fausse ;
 *   · un Word (`.docx`) — ses images JPEG et PNG.
 *
 * Un CV photographié (JPEG, PNG) est une image entière : on n'y découpe rien.
 */

export type ImageDuCv = {
  octets: Uint8Array;
  format: 'jpg' | 'png';
  largeur: number;
  hauteur: number;
};

/** Une photo de plus de 2 Mo n'est pas une photo d'identité : on ne la prend pas. */
export const TAILLE_MAXIMALE_PHOTO_DU_CV = 2 * 1024 * 1024;

/**
 * Largeur et hauteur d'une image JPEG ou PNG, lues dans ses octets, ou `null`.
 *
 *   · PNG  — l'en-tête IHDR, aux octets 16 à 23 ;
 *   · JPEG — le premier marqueur de début d'image (SOF0 à SOF15, sauf les
 *            marqueurs DHT, JPG et DAC qui partagent la même plage).
 */
export function dimensionsDImage(octets: Uint8Array): { largeur: number; hauteur: number } | null {
  const format = formatDImage(octets);
  const mot16 = (i: number) => (octets[i] << 8) | octets[i + 1];
  const mot32 = (i: number) =>
    ((octets[i] << 24) | (octets[i + 1] << 16) | (octets[i + 2] << 8) | octets[i + 3]) >>> 0;

  if (format === 'png') {
    if (octets.length < 24) return null;
    return { largeur: mot32(16), hauteur: mot32(20) };
  }

  if (format === 'jpg') {
    let i = 2;
    while (i + 9 < octets.length) {
      if (octets[i] !== 0xff) return null;
      const marqueur = octets[i + 1];
      // Des octets de remplissage 0xFF peuvent précéder un marqueur.
      if (marqueur === 0xff) {
        i += 1;
        continue;
      }
      const debutDImage =
        marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur);
      if (debutDImage) return { hauteur: mot16(i + 5), largeur: mot16(i + 7) };
      i += 2 + mot16(i + 2);
    }
  }

  return null;
}

/** Au plus six images montrées à Claude : un CV en porte rarement davantage. */
export const MAXIMUM_D_IMAGES_MONTREES = 6;

/**
 * Parmi les images d'un CV, celles qui pourraient être une photo, des plus
 * grandes aux plus petites, six au plus. Sont écartés d'emblée : les icônes
 * et les puces (moins de 80 pixels de côté), les bandeaux et les logos très
 * allongés, les pages entières numérisées (plus de 2 000 pixels), et les
 * fichiers de plus de 2 Mo. C'est Claude qui désigne la photo parmi elles.
 */
export function imagesPossibles(images: readonly ImageDuCv[]): ImageDuCv[] {
  return images
    .filter((image) => {
      const { largeur, hauteur } = image;
      if (!largeur || !hauteur) return false;
      const rapport = largeur / hauteur;
      return (
        image.octets.length <= TAILLE_MAXIMALE_PHOTO_DU_CV &&
        Math.min(largeur, hauteur) >= 80 &&
        Math.max(largeur, hauteur) <= 2000 &&
        rapport >= 0.5 &&
        rapport <= 1.6
      );
    })
    .sort((a, b) => b.largeur * b.hauteur - a.largeur * a.hauteur)
    .slice(0, MAXIMUM_D_IMAGES_MONTREES);
}

/**
 * Un PNG en couleur (3 composantes) ou en gris (1), 8 bits, à partir de ses
 * lignes de pixels **déjà précédées** de leur octet de filtre PNG — la forme
 * exacte des données d'une image PDF compressée avec un prédicteur PNG.
 */
export function pngDepuisLignes(
  largeur: number,
  hauteur: number,
  composantes: 1 | 3,
  lignes: Uint8Array,
): Uint8Array {
  const bloc = (type: string, donnees: Uint8Array) => {
    const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees]);
    const longueur = Buffer.alloc(4);
    longueur.writeUInt32BE(donnees.length);
    const controle = Buffer.alloc(4);
    controle.writeUInt32BE(zlib.crc32(corps) >>> 0);
    return Buffer.concat([longueur, corps, controle]);
  };
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // bits par composante
  entete[9] = composantes === 3 ? 2 : 0; // couleur RVB, ou gris
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bloc('IHDR', entete),
      bloc('IDAT', zlib.deflateSync(lignes)),
      bloc('IEND', new Uint8Array(0)),
    ]),
  );
}

/** Un PNG à partir de pixels bruts : chaque ligne reçoit le filtre « aucun ». */
export function pngDepuisPixels(
  largeur: number,
  hauteur: number,
  composantes: 1 | 3,
  pixels: Uint8Array,
): Uint8Array {
  const ligne = largeur * composantes;
  const lignes = new Uint8Array((ligne + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    lignes.set(pixels.subarray(y * ligne, (y + 1) * ligne), y * (ligne + 1) + 1);
  }
  return pngDepuisLignes(largeur, hauteur, composantes, lignes);
}

/** Les filtres qu'aucune reconstruction en PNG ne sait défaire. */
const FILTRES_D_IMAGE = new Set(['DCTDecode', 'JPXDecode', 'JBIG2Decode', 'CCITTFaxDecode']);

/**
 * Les couleurs d'une image : RVB, gris, CMJN — ou `null` pour ce qu'on ne
 * reconstruit pas (palette, Lab, séparation…). Un profil ICC compte pour le
 * nombre de composantes qu'il annonce.
 */
function couleursDe(valeur: unknown): 'rvb' | 'gris' | 'cmjn' | null {
  if (valeur instanceof PDFName) {
    const nom = valeur.decodeText();
    if (nom === 'DeviceRGB' || nom === 'CalRGB') return 'rvb';
    if (nom === 'DeviceGray' || nom === 'CalGray') return 'gris';
    if (nom === 'DeviceCMYK') return 'cmjn';
    return null;
  }
  if (valeur instanceof PDFArray && valeur.size() > 0) {
    const famille = valeur.lookup(0);
    if (!(famille instanceof PDFName)) return null;
    if (famille.decodeText() === 'CalRGB') return 'rvb';
    if (famille.decodeText() === 'CalGray') return 'gris';
    if (famille.decodeText() === 'ICCBased') {
      const profil = valeur.lookup(1);
      const n = profil instanceof PDFRawStream ? profil.dict.lookup(PDFName.of('N')) : null;
      const composantes = n instanceof PDFNumber ? n.asNumber() : 0;
      return composantes === 3 ? 'rvb' : composantes === 1 ? 'gris' : composantes === 4 ? 'cmjn' : null;
    }
  }
  return null;
}

/** Les noms des filtres d'un flux, dans l'ordre. */
function filtresDe(valeur: unknown): string[] {
  if (valeur instanceof PDFName) return [valeur.decodeText()];
  if (valeur instanceof PDFArray) {
    return valeur
      .asArray()
      .map((filtre) => (filtre instanceof PDFName ? filtre.decodeText() : '?'));
  }
  return [];
}

/** Le prédicteur d'une image compressée, ou 1 (aucun). */
function predicteurDe(parametres: unknown): number {
  const dictionnaire =
    parametres instanceof PDFArray ? parametres.lookup(parametres.size() - 1) : parametres;
  if (!(dictionnaire instanceof PDFDict)) return 1;
  const predicteur = dictionnaire.lookup(PDFName.of('Predictor'));
  return predicteur instanceof PDFNumber ? predicteur.asNumber() : 1;
}

/**
 * Les images d'un PDF qui pourraient être une photo : les JPEG tels quels, et
 * les autres reconstruites en PNG. Les masques de transparence (`SMask`) des
 * autres images n'en sont pas : ils sont écartés.
 */
export async function imagesDuPdf(octets: Uint8Array): Promise<ImageDuCv[]> {
  const document = await PDFDocument.load(octets, { ignoreEncryption: true, updateMetadata: false });
  const nom = (texte: string) => PDFName.of(texte);
  const nombre = (valeur: unknown) => (valeur instanceof PDFNumber ? valeur.asNumber() : 0);
  const objets = document.context.enumerateIndirectObjects();

  // Les masques : des images en gris qui ne montrent que la transparence d'une autre.
  const masques = new Set<string>();
  for (const [, objet] of objets) {
    if (!(objet instanceof PDFRawStream)) continue;
    const masque = objet.dict.get(nom('SMask'));
    if (masque) masques.add(masque.toString());
  }

  const images: ImageDuCv[] = [];
  for (const [reference, objet] of objets) {
    if (!(objet instanceof PDFRawStream) || masques.has(reference.toString())) continue;
    const dictionnaire = objet.dict;
    if (dictionnaire.lookup(nom('Subtype')) !== nom('Image')) continue;

    const largeur = nombre(dictionnaire.lookup(nom('Width')));
    const hauteur = nombre(dictionnaire.lookup(nom('Height')));
    // Trop petite ou trop grande pour une photo : inutile de la décoder.
    if (Math.min(largeur, hauteur) < 80 || Math.max(largeur, hauteur) > 2000) continue;

    const filtres = filtresDe(dictionnaire.lookup(nom('Filter')));
    const couleurs = couleursDe(dictionnaire.lookup(nom('ColorSpace')));

    // Un JPEG : recopié tel quel. En CMJN, un navigateur l'afficherait en
    // couleurs fausses.
    if (filtres.length === 1 && filtres[0] === 'DCTDecode') {
      if (couleurs === 'cmjn' || formatDImage(objet.contents) !== 'jpg') continue;
      images.push({ octets: objet.contents, format: 'jpg', largeur, hauteur });
      continue;
    }

    // Les autres : reconstruites en PNG, quand on sait le faire fidèlement.
    if (filtres.some((filtre) => FILTRES_D_IMAGE.has(filtre))) continue;
    if ((couleurs !== 'rvb' && couleurs !== 'gris') || nombre(dictionnaire.lookup(nom('BitsPerComponent'))) !== 8) {
      continue;
    }
    const composantes = couleurs === 'rvb' ? 3 : 1;

    try {
      const donnees = decodePDFRawStream(objet).decode();
      const predicteur = predicteurDe(dictionnaire.lookup(nom('DecodeParms')));
      const ligne = largeur * composantes;

      let png: Uint8Array | null = null;
      if (predicteur >= 10 && donnees.length === (ligne + 1) * hauteur) {
        // Un prédicteur PNG : les lignes portent déjà leur octet de filtre.
        png = pngDepuisLignes(largeur, hauteur, composantes, donnees);
      } else if (predicteur === 1 && donnees.length === ligne * hauteur) {
        png = pngDepuisPixels(largeur, hauteur, composantes, donnees);
      }
      if (png) images.push({ octets: png, format: 'png', largeur, hauteur });
    } catch {
      // Une image qu'on ne sait pas décoder : on passe à la suivante.
    }
  }

  return images;
}

/** Les images JPEG et PNG d'un document Word. */
export async function imagesDuDocx(octets: Uint8Array): Promise<ImageDuCv[]> {
  const images: ImageDuCv[] = [];

  await mammoth.convertToHtml(
    { buffer: Buffer.from(octets) },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const contenu = new Uint8Array(await image.readAsBuffer());
        const format = formatDImage(contenu);
        const dimensions = dimensionsDImage(contenu);
        if ((format === 'jpg' || format === 'png') && dimensions) {
          images.push({ octets: contenu, format, ...dimensions });
        }
        return { src: '' };
      }),
    },
  );

  return images;
}

/**
 * Les images du CV qui pourraient être sa photo — à montrer à Claude. Ne
 * lève jamais : un CV dont on ne sait pas sortir d'image se lit quand même,
 * sans photo.
 */
export async function imagesDuCv(octets: Uint8Array, format: string): Promise<ImageDuCv[]> {
  try {
    if (format === 'pdf') return imagesPossibles(await imagesDuPdf(octets));
    if (format === 'docx') return imagesPossibles(await imagesDuDocx(octets));
    return [];
  } catch {
    return [];
  }
}
