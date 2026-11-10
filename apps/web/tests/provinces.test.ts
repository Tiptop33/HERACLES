import { describe, expect, it } from 'vitest';
import { initialeDeProvince, rangerProvinces } from '../src/lib/provinces';

describe('rangerProvinces', () => {
  it('range dans l’ordre alphabétique français, accents compris', () => {
    const rangees = rangerProvinces([
      { nom: 'Occitanie' },
      { nom: 'Île-de-France' },
      { nom: 'Bretagne' },
      { nom: 'Auvergne' },
    ]);
    expect(rangees.map((p) => p.nom)).toEqual(['Auvergne', 'Bretagne', 'Île-de-France', 'Occitanie']);
  });

  it('met les provinces sans nom à la fin — une reprise incomplète ne cache pas les autres', () => {
    const rangees = rangerProvinces([{ nom: null }, { nom: 'Bretagne' }, { nom: '  ' }, { nom: 'Alsace' }]);
    expect(rangees.map((p) => p.nom)).toEqual(['Alsace', 'Bretagne', null, '  ']);
  });

  it('ne touche pas à la liste reçue', () => {
    const liste = [{ nom: 'B' }, { nom: 'A' }];
    rangerProvinces(liste);
    expect(liste.map((p) => p.nom)).toEqual(['B', 'A']);
  });
});

describe('initialeDeProvince', () => {
  it('prend la première lettre du nom, en capitale', () => {
    expect(initialeDeProvince('bretagne')).toBe('B');
    expect(initialeDeProvince('Île-de-France')).toBe('Î');
  });

  it('saute « Province » et son article — sinon toutes les cartes porteraient un P', () => {
    expect(initialeDeProvince('Province de Normandie')).toBe('N');
    expect(initialeDeProvince('Province du Centre')).toBe('C');
    expect(initialeDeProvince('Province des Flandres')).toBe('F');
    expect(initialeDeProvince('Province de la Loire')).toBe('L');
    expect(initialeDeProvince("Province d'Aquitaine")).toBe('A');
    expect(initialeDeProvince('Province de l’Ain')).toBe('A');
  });

  it('garde « Province » quand il n’y a rien après', () => {
    expect(initialeDeProvince('Province')).toBe('P');
  });

  it('ne casse pas un nom qui commence seulement comme « Province »', () => {
    expect(initialeDeProvince('Provinces-Unies')).toBe('P');
  });

  it('rend un point d’interrogation faute de nom', () => {
    expect(initialeDeProvince(null)).toBe('?');
    expect(initialeDeProvince('   ')).toBe('?');
    expect(initialeDeProvince('—')).toBe('?');
  });
});
