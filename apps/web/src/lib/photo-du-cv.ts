import mammoth from 'mammoth';
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
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
 *   · un PDF — ses images enregistrées en JPEG (`DCTDecode`), la façon dont
 *     Word, LibreOffice ou Canva rangent une photo. Les images compressées
 *     autrement ne sont pas reconstruites : pas de photo, plutôt qu'une
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

/** Les images JPEG d'un PDF, telles qu'il les porte — sans les décoder. */
export async function imagesDuPdf(octets: Uint8Array): Promise<ImageDuCv[]> {
  const document = await PDFDocument.load(octets, { ignoreEncryption: true, updateMetadata: false });
  const images: ImageDuCv[] = [];
  const nom = (texte: string) => PDFName.of(texte);
  const nombre = (valeur: unknown) => (valeur instanceof PDFNumber ? valeur.asNumber() : 0);

  for (const [, objet] of document.context.enumerateIndirectObjects()) {
    if (!(objet instanceof PDFRawStream)) continue;
    const dictionnaire = objet.dict;
    if (dictionnaire.lookup(nom('Subtype')) !== nom('Image')) continue;

    const filtre = dictionnaire.lookup(nom('Filter'));
    const enJpeg =
      filtre === nom('DCTDecode') ||
      (filtre instanceof PDFArray && filtre.size() === 1 && filtre.lookup(0) === nom('DCTDecode'));
    if (!enJpeg) continue;

    // Un JPEG en CMJN s'affiche en couleurs fausses dans un navigateur.
    if (dictionnaire.lookup(nom('ColorSpace')) === nom('DeviceCMYK')) continue;

    const contenu = objet.contents;
    if (formatDImage(contenu) !== 'jpg') continue;

    images.push({
      octets: contenu,
      format: 'jpg',
      largeur: nombre(dictionnaire.lookup(nom('Width'))),
      hauteur: nombre(dictionnaire.lookup(nom('Height'))),
    });
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
