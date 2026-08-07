import { describe, expect, it } from 'vitest';
import { enTeteDeTelechargement, extensionDe, typeDeFichier } from '../src/lib/fichiers';

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

  it('ne rend jamais un nom vide', () => {
    expect(enTeteDeTelechargement('   ')).toContain('filename="document"');
  });
});
