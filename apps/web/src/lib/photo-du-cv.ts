import mammoth from 'mammoth';
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { formatDImage } from './fichiers';

/**
 * Trouver, dans le CV du candidat, sa photo — sur le serveur de HERACLES.
 *
 * Rien ne part ailleurs : Claude, qui lit déjà le CV, dit seulement s'il y
 * voit un portrait (`photo` dans `LectureDuCv`). C'est ici qu'on sort
 * l'image du fichier, et qu'on choisit, parmi les images du CV, celle qui a
 * la forme d'une photo d'identité.
 *
 * Le candidat la voit avant d'envoyer sa fiche, et peut la refuser : une
 * erreur coûte un clic, jamais une photo rangée à son insu.
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

/**
 * Parmi les images d'un CV, celle qui a la forme d'une photo d'identité, ou
 * `null`. Sont écartés : les icônes et les puces (moins de 80 pixels de
 * côté), les bandeaux et les logos allongés, les pages entières numérisées
 * (plus de 2 000 pixels), et les fichiers trop lourds. Parmi ce qui reste,
 * la plus grande — un CV montre rarement deux portraits.
 */
export function choisirLaPhoto(images: readonly ImageDuCv[]): ImageDuCv | null {
  const portraits = images.filter((image) => {
    const { largeur, hauteur } = image;
    if (!largeur || !hauteur) return false;
    const rapport = largeur / hauteur;
    return (
      image.octets.length <= TAILLE_MAXIMALE_PHOTO_DU_CV &&
      Math.min(largeur, hauteur) >= 80 &&
      Math.max(largeur, hauteur) <= 2000 &&
      rapport >= 0.55 &&
      rapport <= 1.35
    );
  });

  let meilleure: ImageDuCv | null = null;
  for (const image of portraits) {
    if (!meilleure || image.largeur * image.hauteur > meilleure.largeur * meilleure.hauteur) {
      meilleure = image;
    }
  }
  return meilleure;
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
 * La photo du candidat dans son CV, ou `null`. Ne lève jamais : un CV dont
 * on ne sait pas sortir d'image se lit quand même, sans photo.
 */
export async function photoDuCv(octets: Uint8Array, format: string): Promise<ImageDuCv | null> {
  try {
    if (format === 'pdf') return choisirLaPhoto(await imagesDuPdf(octets));
    if (format === 'docx') return choisirLaPhoto(await imagesDuDocx(octets));
    return null;
  } catch {
    return null;
  }
}
