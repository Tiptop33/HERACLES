import { describe, expect, it } from 'vitest';
import {
  enTeteDeTelechargement,
  extensionDe,
  formatDImage,
  formatDeDocument,
  typeDeFichier,
} from '../src/lib/fichiers';

/** Un fichier réduit à ce que la reconnaissance regarde : son début. */
function debut(...octets: (number | string)[]): Uint8Array {
  const plat = octets.flatMap((o) =>
    typeof o === 'string' ? [...o].map((c) => c.charCodeAt(0)) : [o],
  );
  // Une queue de zéros : un vrai fichier ne s'arrête pas à son en-tête, et la
  // lecture ne doit pas dépendre de la longueur.
  return new Uint8Array([...plat, ...Array(32).fill(0)]);
}

describe('typeDeFichier', () => {
  it('reconnaît ce que Bubble a déposé', () => {
    expect(typeDeFichier('candidat/cv/1733742885881x42.pdf')).toBe('application/pdf');
    expect(typeDeFichier('candidat/cv/ancien.doc')).toBe('application/msword');
    expect(typeDeFichier('referent/photo/x.JPG')).toBe('image/jpeg');
  });

  it('préfère l’extension à ce que dit le stockage', () => {
    // Un CV arrivé de Bubble en « octet-stream » s'ouvrirait comme un fichier
    // à télécharger plutôt que comme un PDF.
    expect(typeDeFichier('cv.pdf', 'application/octet-stream')).toBe('application/pdf');
  });

  it('se rabat sur le stockage, puis sur le générique', () => {
    expect(typeDeFichier('sans-extension', 'image/heic')).toBe('image/heic');
    expect(typeDeFichier('sans-extension')).toBe('application/octet-stream');
    expect(typeDeFichier('inconnu.xyz')).toBe('application/octet-stream');
  });
});

describe('extensionDe', () => {
  it('rend l’extension, point compris', () => {
    expect(extensionDe('candidat/cv/x.PDF')).toBe('.pdf');
  });

  it('ne rend rien quand il n’y en a pas', () => {
    expect(extensionDe('candidat/cv/x')).toBe('');
    // Un point dans un dossier n'est pas une extension de fichier.
    expect(extensionDe('mon.dossier/fichier')).toBe('');
  });
});

describe('enTeteDeTelechargement', () => {
  it('donne au fichier un nom qui se reconnaît tout seul', () => {
    expect(enTeteDeTelechargement('CV - MARTIN Alice.pdf')).toBe(
      'attachment; filename="CV - MARTIN Alice.pdf"; ' +
        "filename*=UTF-8''CV%20-%20MARTIN%20Alice.pdf",
    );
  });

  it('garde les accents dans la forme qui sait les porter', () => {
    const entete = enTeteDeTelechargement('CV - LEFÈVRE Élodie.pdf');
    // Le repli est dépouillé…
    expect(entete).toContain('filename="CV - LEF_VRE _lodie.pdf"');
    // …mais le nom véritable passe par `filename*`.
    expect(entete).toContain("filename*=UTF-8''CV%20-%20LEF%C3%88VRE%20%C3%89lodie.pdf");
  });

  it('ne laisse pas un nom refermer la chaîne ni sortir du dossier', () => {
    const entete = enTeteDeTelechargement('CV "faux"/../etc/passwd');
    expect(entete).toContain('filename="CV faux .. etc passwd"');
    expect(entete).not.toContain('/');
  });

  it('sait aussi ouvrir le fichier dans le navigateur, sous le même nom', () => {
    // Les documents de la commission s'ouvrent dans le lecteur PDF : on les
    // relit avant de les envoyer.
    expect(enTeteDeTelechargement('Affiche_du_mercredi_14_octobre_2026.pdf', 'inline')).toBe(
      'inline; filename="Affiche_du_mercredi_14_octobre_2026.pdf"; ' +
        "filename*=UTF-8''Affiche_du_mercredi_14_octobre_2026.pdf",
    );
  });

  it('ne rend jamais un nom vide', () => {
    expect(enTeteDeTelechargement('   ')).toContain('filename="document"');
  });
});

describe('formatDImage', () => {
  it('reconnaît les cinq formats que les navigateurs affichent', () => {
    expect(formatDImage(debut(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(formatDImage(debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(formatDImage(debut('GIF89a'))).toBe('gif');
    expect(formatDImage(debut('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('webp');
    expect(formatDImage(debut(0, 0, 0, 32, 'ftyp', 'avif'))).toBe('avif');
    expect(formatDImage(debut(0, 0, 0, 32, 'ftyp', 'avis'))).toBe('avif');
  });

  // Le nom du fichier vient du navigateur : c'est le contenu qui décide, sinon
  // un document quelconque se ferait servir comme une image.
  it('refuse ce qui n’est pas une image, quel que soit son nom', () => {
    expect(formatDImage(debut('%PDF-1.7'))).toBeNull();
    expect(formatDImage(debut('<svg xmlns='))).toBeNull();
    expect(formatDImage(debut('<!DOCTYPE html>'))).toBeNull();
    expect(formatDImage(debut('PK', 3, 4))).toBeNull();
  });

  it('ne se laisse pas prendre à un début qui ressemble', () => {
    // « RIFF » sans « WEBP » : un son .wav, par exemple.
    expect(formatDImage(debut('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
    // Une boîte ISO-BMFF qui n'est pas de l'AVIF : une vidéo .mp4.
    expect(formatDImage(debut(0, 0, 0, 32, 'ftyp', 'isom'))).toBeNull();
    // Un PNG amputé de la fin de sa signature.
    expect(formatDImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it('ne bronche pas sur un fichier vide', () => {
    expect(formatDImage(new Uint8Array())).toBeNull();
  });
});

describe('formatDeDocument', () => {
  it('reconnaît un PDF à sa signature', () => {
    expect(formatDeDocument(debut('%PDF-1.7'))).toBe('pdf');
  });

  it('reconnaît un document Word 97-2003', () => {
    expect(formatDeDocument(debut(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe('doc');
  });

  it('distingue un ODT d’un DOCX, deux archives ZIP', () => {
    const zip = [0x50, 0x4b, 0x03, 0x04];
    // Vingt-six octets d'en-tête de membre, puis le nom `mimetype` et son
    // contenu, comme la norme OpenDocument l'impose.
    const odt = debut(...zip, ...Array(26).fill(0), 'mimetypeapplication/vnd.oasis.opendocument.text');
    expect(formatDeDocument(odt)).toBe('odt');
    expect(formatDeDocument(debut(...zip, ...Array(26).fill(0), '[Content_Types].xml'))).toBe('docx');
  });

  it('reconnaît un RTF', () => {
    expect(formatDeDocument(debut('{\\rtf1\\ansi'))).toBe('rtf');
  });

  it('accepte la photo d’un CV, en JPEG, PNG ou WebP', () => {
    expect(formatDeDocument(debut(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(formatDeDocument(debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(formatDeDocument(debut('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('webp');
  });

  it('refuse le reste, quel que soit le nom du fichier', () => {
    expect(formatDeDocument(debut('GIF89a'))).toBeNull();
    expect(formatDeDocument(debut('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(formatDeDocument(debut('MZ'))).toBeNull();
    expect(formatDeDocument(new Uint8Array())).toBeNull();
  });
});
