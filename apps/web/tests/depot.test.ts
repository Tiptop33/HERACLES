import { describe, expect, it } from 'vitest';
import { ACCEPTE_ECUSSON, porteDesFichiers, refusDeLEcusson, refusDuDocument } from '../src/lib/depot';

const MO = 1024 * 1024;
const fichier = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('refusDeLEcusson', () => {
  it('accepte les cinq formats d’image que le serveur reconnaît', () => {
    for (const [nom, type] of [
      ['a.jpg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
      ['a.gif', 'image/gif'],
      ['a.avif', 'image/avif'],
    ]) {
      expect(refusDeLEcusson(fichier(nom, type), 5 * MO)).toBeNull();
    }
  });

  it('refuse ce qui n’est pas une de ces images — un PDF, un SVG, un document', () => {
    const message = 'Ce fichier n’est pas une image reconnue : JPEG, PNG, WebP, GIF ou AVIF.';
    expect(refusDeLEcusson(fichier('a.pdf', 'application/pdf'), 5 * MO)).toBe(message);
    expect(refusDeLEcusson(fichier('a.svg', 'image/svg+xml'), 5 * MO)).toBe(message);
    expect(refusDeLEcusson(fichier('a.docx', ''), 5 * MO)).toBe(message);
  });

  it('juge à l’extension un fichier dont le système ne dit pas le type', () => {
    expect(refusDeLEcusson(fichier('blason.AVIF', ''), 5 * MO)).toBeNull();
    expect(refusDeLEcusson(fichier('blason.jpeg', ''), 5 * MO)).toBeNull();
  });

  it('ne se fie pas à l’extension quand le type est donné', () => {
    expect(refusDeLEcusson(fichier('piege.png', 'application/pdf'), 5 * MO)).not.toBeNull();
  });

  it('refuse un fichier vide ou trop lourd', () => {
    expect(refusDeLEcusson(fichier('a.png', 'image/png', 0), 5 * MO)).toBe('Ce fichier est vide.');
    expect(refusDeLEcusson(fichier('a.png', 'image/png', 5 * MO + 1), 5 * MO)).toBe('Cette image dépasse 5 Mo.');
    expect(refusDeLEcusson(fichier('a.png', 'image/png', 5 * MO), 5 * MO)).toBeNull();
  });
});

describe('porteDesFichiers', () => {
  it('ne réagit qu’à un glisser de fichiers', () => {
    expect(porteDesFichiers({ types: ['Files'] })).toBe(true);
    expect(porteDesFichiers({ types: ['text/plain', 'text/uri-list'] })).toBe(false);
    expect(porteDesFichiers(null)).toBe(false);
  });
});

describe('ACCEPTE_ECUSSON', () => {
  it('liste les mêmes formats que le serveur, pour « Parcourir »', () => {
    expect(ACCEPTE_ECUSSON).toBe('image/jpeg,image/png,image/webp,image/gif,image/avif');
  });
});

describe('refusDuDocument', () => {
  it('accepte les formats de CV que le serveur reconnaît', () => {
    for (const [nom, type] of [
      ['cv.pdf', 'application/pdf'],
      ['cv.doc', 'application/msword'],
      ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['cv.odt', 'application/vnd.oasis.opendocument.text'],
      ['cv.rtf', 'application/rtf'],
      ['cv.jpg', 'image/jpeg'],
      ['cv.png', 'image/png'],
      ['cv.webp', 'image/webp'],
    ]) {
      expect(refusDuDocument(fichier(nom, type), 10 * MO)).toBeNull();
    }
  });

  it('laisse passer à l’extension un fichier au type absent ou inattendu', () => {
    expect(refusDuDocument(fichier('CV Inès.DOCX', ''), 10 * MO)).toBeNull();
    expect(refusDuDocument(fichier('cv.rtf', 'application/x-rtf'), 10 * MO)).toBeNull();
  });

  it('refuse ce qui n’est pas un document — une archive, un tableur, un GIF', () => {
    const message = 'Ce fichier n’est pas reconnu : PDF, Word, OpenDocument, RTF ou photo (JPEG, PNG, WebP).';
    expect(refusDuDocument(fichier('cv.zip', 'application/zip'), 10 * MO)).toBe(message);
    expect(refusDuDocument(fichier('cv.xlsx', ''), 10 * MO)).toBe(message);
    expect(refusDuDocument(fichier('cv.gif', 'image/gif'), 10 * MO)).toBe(message);
    expect(refusDuDocument(fichier('cv', ''), 10 * MO)).toBe(message);
  });

  it('refuse un fichier vide ou trop lourd', () => {
    expect(refusDuDocument(fichier('cv.pdf', 'application/pdf', 0), 10 * MO)).toBe('Ce fichier est vide.');
    expect(refusDuDocument(fichier('cv.pdf', 'application/pdf', 10 * MO + 1), 10 * MO)).toBe('Ce fichier dépasse 10 Mo.');
    expect(refusDuDocument(fichier('cv.pdf', 'application/pdf', 10 * MO), 10 * MO)).toBeNull();
  });
});
