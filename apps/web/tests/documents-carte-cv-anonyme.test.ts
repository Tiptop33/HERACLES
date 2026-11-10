import { describe, expect, it } from 'vitest';
import { carteDuCvAnonyme, type DocumentsDeLaFiche } from '../src/lib/documents/carte-cv-anonyme';

const VIDE: DocumentsDeLaFiche = { cv_chemin: null, cv_url: null, cv_anonyme_chemin: null, cv_anonyme_url: null };
const AVEC_CV: DocumentsDeLaFiche = { ...VIDE, cv_chemin: 'candidats/x/cv.pdf' };

describe('la carte « CV anonyme » de la fiche', () => {
  it('se fait toute seule dès qu’il y a un CV original, à valider', () => {
    expect(carteDuCvAnonyme(AVEC_CV, null)).toEqual({ sorte: 'produit', aValider: true });
  });

  it('vaut aussi pour un CV original resté chez Bubble', () => {
    expect(carteDuCvAnonyme({ ...VIDE, cv_url: 'https://exemple.org/cv.pdf' }, null)).toEqual({
      sorte: 'produit',
      aValider: true,
    });
  });

  it('validé, ouvre le CV produit — avant tout fichier déposé, comme le lien public', () => {
    expect(carteDuCvAnonyme(AVEC_CV, '2026-11-10T09:00:00Z')).toEqual({ sorte: 'produit', aValider: false });
    expect(
      carteDuCvAnonyme({ ...AVEC_CV, cv_anonyme_chemin: 'candidats/x/cv-anonyme.pdf' }, '2026-11-10T09:00:00Z'),
    ).toEqual({ sorte: 'produit', aValider: false });
  });

  it('non validé, garde le fichier déposé ou repris de Bubble', () => {
    expect(carteDuCvAnonyme({ ...AVEC_CV, cv_anonyme_chemin: 'candidats/x/cv-anonyme.pdf' }, null)).toEqual({
      sorte: 'depose',
    });
    expect(carteDuCvAnonyme({ ...AVEC_CV, cv_anonyme_url: 'https://exemple.org/anonyme.pdf' }, null)).toEqual({
      sorte: 'bubble',
    });
  });

  it('sans CV original ni fichier, reste « non fourni »', () => {
    expect(carteDuCvAnonyme(VIDE, null)).toEqual({ sorte: 'absent' });
    expect(carteDuCvAnonyme(VIDE, undefined)).toEqual({ sorte: 'absent' });
  });
});
