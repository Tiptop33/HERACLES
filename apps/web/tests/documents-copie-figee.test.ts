import { describe, expect, it } from 'vitest';
import { estUneCopieFigee } from '../src/lib/documents/copie-figee';

// Le chemin d'une copie figée vient de la base (migration 0075) ; il est
// revérifié avant que la clé de service ne touche au seau.
const CANDIDAT = '3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f';
const COPIE = `candidats/${CANDIDAT}/cv-anonyme-valide-1793606400123.pdf`;

describe('la copie figée du CV anonyme', () => {
  it('reconnaît la forme qu’écrit la base', () => {
    expect(estUneCopieFigee(COPIE)).toBe(true);
    expect(estUneCopieFigee(COPIE, CANDIDAT)).toBe(true);
    expect(estUneCopieFigee(COPIE, CANDIDAT.toUpperCase())).toBe(true);
  });

  it('refuse la copie d’un autre candidat', () => {
    expect(estUneCopieFigee(COPIE, '00000000-0000-4000-8000-000000000000')).toBe(false);
  });

  it('refuse tout autre fichier du seau', () => {
    for (const chemin of [
      `candidats/${CANDIDAT}/cv.pdf`,
      `candidats/${CANDIDAT}/photo.jpg`,
      `candidats/${CANDIDAT}/cv-anonyme-valide-.pdf`,
      `candidats/${CANDIDAT}/cv-anonyme-valide-12.pdf/../cv.pdf`,
      `archives/${CANDIDAT}/cv-anonyme-valide-12.pdf`,
      `/candidats/${CANDIDAT}/cv-anonyme-valide-12.pdf`,
      `candidats/${CANDIDAT}/cv-anonyme-valide-12.pdf\n`,
      `candidats/../${CANDIDAT}/cv-anonyme-valide-12.pdf`,
      '',
    ]) {
      expect(estUneCopieFigee(chemin), chemin).toBe(false);
    }
  });

  it('refuse ce qui n’est pas un texte', () => {
    expect(estUneCopieFigee(null)).toBe(false);
    expect(estUneCopieFigee(undefined)).toBe(false);
    expect(estUneCopieFigee(42)).toBe(false);
  });
});
