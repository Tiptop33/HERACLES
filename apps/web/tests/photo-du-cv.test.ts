import zlib from 'node:zlib';
import JSZip from 'jszip';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_D_IMAGES_MONTREES,
  dimensionsDImage,
  imagesDuCv,
  imagesDuDocx,
  imagesDuPdf,
  imagesPossibles,
  pngDepuisPixels,
  type ImageDuCv,
} from '../src/lib/photo-du-cv';

/**
 * Un JPEG réduit à ce qui le fait reconnaître : le début de fichier, un
 * marqueur SOF0 qui porte ses dimensions, la fin de fichier. Ni décodable ni
 * affichable — et c'est assez : on ne décode jamais, on recopie.
 */
function fauxJpeg(largeur: number, hauteur: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // début
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, longueur 17, 8 bits
    hauteur >> 8, hauteur & 0xff, largeur >> 8, largeur & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, // 3 composantes
    0xff, 0xd9, // fin
  ]);
}

/** Les vingt-quatre premiers octets d'un PNG : signature et en-tête IHDR. */
function fauxPng(largeur: number, hauteur: number): Uint8Array {
  const octets = new Uint8Array(33);
  octets.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(octets.buffer).setUint32(16, largeur);
  new DataView(octets.buffer).setUint32(20, hauteur);
  return octets;
}

const image = (largeur: number, hauteur: number, taille = 1000): ImageDuCv => ({
  octets: new Uint8Array(taille),
  format: 'jpg',
  largeur,
  hauteur,
});

/** Un PDF d'une page qui porte les JPEG donnés. */
async function pdfAvec(...jpegs: Uint8Array[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  for (const octets of jpegs) {
    const jpeg = await document.embedJpg(octets);
    page.drawImage(jpeg, { x: 40, y: 600, width: 100, height: 120 });
  }
  return document.save();
}

/** Un document Word minimal, qui porte l'image donnée. */
async function docxAvec(octets: Uint8Array, extension: 'jpeg' | 'png'): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="${extension}" ContentType="image/${extension}"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.${extension}"/></Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="1143000"/><wp:docPr id="1" name="Photo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="photo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdPhoto"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:t>Camille TESTEUR</w:t></w:r></w:p></w:body></w:document>`,
  );
  zip.file(`word/media/photo.${extension}`, octets);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('les dimensions d’une image, lues dans ses octets', () => {
  it('lit un JPEG et un PNG', () => {
    expect(dimensionsDImage(fauxJpeg(300, 400))).toEqual({ largeur: 300, hauteur: 400 });
    expect(dimensionsDImage(fauxPng(640, 480))).toEqual({ largeur: 640, hauteur: 480 });
  });

  it('ne devine rien sur ce qui n’est pas une image', () => {
    expect(dimensionsDImage(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });
});

describe('les images qui pourraient être une photo', () => {
  it('les garde des plus grandes aux plus petites — Claude choisira', () => {
    const qrCode = image(500, 500);
    const portrait = image(300, 400);
    expect(imagesPossibles([image(150, 200), portrait, qrCode])).toEqual([
      qrCode,
      portrait,
      image(150, 200),
    ]);
  });

  it('écarte les icônes, les bandeaux, les pages numérisées et les fichiers trop lourds', () => {
    expect(imagesPossibles([image(32, 32)])).toEqual([]); // une icône
    expect(imagesPossibles([image(600, 150)])).toEqual([]); // un logo en bandeau
    expect(imagesPossibles([image(2480, 3508)])).toEqual([]); // une page A4 à 300 dpi
    expect(imagesPossibles([image(300, 400, 3 * 1024 * 1024)])).toEqual([]); // 3 Mo
  });

  it('n’en montre pas plus de six', () => {
    const nombreuses = Array.from({ length: 9 }, (_, i) => image(200 + i, 200 + i));
    expect(imagesPossibles(nombreuses)).toHaveLength(MAXIMUM_D_IMAGES_MONTREES);
  });
});

describe('les images d’un PDF', () => {
  it('rend ses JPEG tels quels, avec leurs dimensions', async () => {
    const jpeg = fauxJpeg(300, 400);
    const images = await imagesDuPdf(await pdfAvec(jpeg));
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ format: 'jpg', largeur: 300, hauteur: 400 });
    expect(Array.from(images[0].octets)).toEqual(Array.from(jpeg));
  });

  it('écarte le logo en bandeau et garde le portrait', async () => {
    const images = await imagesDuCv(await pdfAvec(fauxJpeg(500, 100), fauxJpeg(300, 400)), 'pdf');
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ largeur: 300, hauteur: 400 });
  });

  it('ne rend rien pour un PDF sans image', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    expect(await imagesDuCv(await document.save(), 'pdf')).toEqual([]);
  });
});

describe('les images d’un document Word', () => {
  it('rend ses JPEG et ses PNG', async () => {
    const enJpeg = await imagesDuDocx(await docxAvec(fauxJpeg(300, 400), 'jpeg'));
    expect(enJpeg).toHaveLength(1);
    expect(enJpeg[0]).toMatchObject({ format: 'jpg', largeur: 300, hauteur: 400 });

    const enPng = await imagesDuDocx(await docxAvec(fauxPng(400, 400), 'png'));
    expect(enPng[0]).toMatchObject({ format: 'png', largeur: 400, hauteur: 400 });
  });
});

describe('ce qui ne se lit pas', () => {
  it('ne lève jamais : un fichier abîmé ne rend aucune image', async () => {
    expect(await imagesDuCv(new TextEncoder().encode('%PDF-abîmé'), 'pdf')).toEqual([]);
    expect(await imagesDuCv(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'docx')).toEqual([]);
  });

  it('ne découpe rien dans un CV photographié', async () => {
    expect(await imagesDuCv(fauxJpeg(300, 400), 'jpg')).toEqual([]);
  });
});

/** Une image d'un PDF, enregistrée telle quelle : le dictionnaire et les octets donnés. */
function imagePdf(
  document: PDFDocument,
  champs: Record<string, string | number>,
  octets: Uint8Array,
) {
  const dictionnaire = document.context.obj({ Type: 'XObject', Subtype: 'Image' });
  for (const [cle, valeur] of Object.entries(champs)) {
    dictionnaire.set(
      PDFName.of(cle),
      typeof valeur === 'number' ? PDFNumber.of(valeur) : PDFName.of(valeur),
    );
  }
  return document.context.register(PDFRawStream.of(dictionnaire, octets));
}

/** `longueur` octets de la même valeur, codés en RunLength. */
function runLength(valeur: number, longueur: number): Uint8Array {
  const octets: number[] = [];
  for (let reste = longueur; reste > 0; ) {
    const n = Math.min(128, reste);
    octets.push(257 - n, valeur);
    reste -= n;
  }
  octets.push(128); // fin
  return new Uint8Array(octets);
}

describe('les images d’un PDF qui ne sont pas des JPEG', () => {
  it('fabrique un PNG valide à partir de pixels bruts', () => {
    const pixels = new Uint8Array(100 * 120 * 3).fill(200);
    const png = pngDepuisPixels(100, 120, 3, pixels);
    expect(dimensionsDImage(png)).toEqual({ largeur: 100, hauteur: 120 });
  });

  it('reconstruit en PNG une image compressée en Flate', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const pixels = new Uint8Array(100 * 120 * 3).fill(128);
    await document.embedPng(pngDepuisPixels(100, 120, 3, pixels));

    const images = await imagesDuPdf(await document.save());
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ format: 'png', largeur: 100, hauteur: 120 });
    expect(dimensionsDImage(images[0].octets)).toEqual({ largeur: 100, hauteur: 120 });
  });

  it('reconstruit en PNG une image en RunLength — la photo du CV du 9 novembre', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    imagePdf(
      document,
      { Width: 100, Height: 100, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'RunLengthDecode' },
      runLength(90, 100 * 100 * 3),
    );

    const images = await imagesDuPdf(await document.save());
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ format: 'png', largeur: 100, hauteur: 100 });
  });

  it('écarte les masques de transparence, les palettes et le CMJN', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    const gris = zlib.deflateSync(new Uint8Array(100 * 100).fill(255));
    const masque = imagePdf(
      document,
      { Width: 100, Height: 100, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' },
      gris,
    );
    const photo = imagePdf(
      document,
      { Width: 100, Height: 100, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' },
      zlib.deflateSync(new Uint8Array(100 * 100 * 3).fill(60)),
    );
    document.context.lookup(photo, PDFRawStream).dict.set(PDFName.of('SMask'), masque);
    imagePdf(
      document,
      { Width: 100, Height: 100, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'FlateDecode' },
      zlib.deflateSync(new Uint8Array(100 * 100 * 4)),
    );

    const images = await imagesDuPdf(await document.save());
    // Seule la photo reste : ni son masque, ni l'image en CMJN.
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ format: 'png', largeur: 100, hauteur: 100 });
  });
});
