import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  choisirLaPhoto,
  dimensionsDImage,
  imagesDuDocx,
  imagesDuPdf,
  photoDuCv,
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

describe('le choix de la photo parmi les images du CV', () => {
  it('prend la plus grande qui a la forme d’un portrait', () => {
    const portrait = image(300, 400);
    expect(choisirLaPhoto([image(150, 200), portrait, image(120, 120)])).toBe(portrait);
  });

  it('écarte les icônes, les bandeaux, les pages numérisées et les fichiers trop lourds', () => {
    expect(choisirLaPhoto([image(32, 32)])).toBeNull(); // une icône
    expect(choisirLaPhoto([image(600, 150)])).toBeNull(); // un logo en bandeau
    expect(choisirLaPhoto([image(2480, 3508)])).toBeNull(); // une page A4 à 300 dpi
    expect(choisirLaPhoto([image(300, 400, 3 * 1024 * 1024)])).toBeNull(); // 3 Mo
    expect(choisirLaPhoto([])).toBeNull();
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

  it('trouve le portrait entre un logo et la photo', async () => {
    const photo = await photoDuCv(await pdfAvec(fauxJpeg(500, 100), fauxJpeg(300, 400)), 'pdf');
    expect(photo).toMatchObject({ largeur: 300, hauteur: 400 });
  });

  it('rend « pas de photo » pour un PDF sans image', async () => {
    const document = await PDFDocument.create();
    document.addPage();
    expect(await photoDuCv(await document.save(), 'pdf')).toBeNull();
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
  it('ne lève jamais : un fichier abîmé rend « pas de photo »', async () => {
    expect(await photoDuCv(new TextEncoder().encode('%PDF-abîmé'), 'pdf')).toBeNull();
    expect(await photoDuCv(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), 'docx')).toBeNull();
  });

  it('ne découpe rien dans un CV photographié', async () => {
    expect(await photoDuCv(fauxJpeg(300, 400), 'jpg')).toBeNull();
  });
});
