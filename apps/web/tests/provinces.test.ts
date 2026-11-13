import { describe, expect, it } from 'vitest';
import {
  ChampsDeLaProvince,
  adresseDeLEcusson,
  initialeDeProvince,
  lireProvincesAGerer,
  nomAffiche,
  questionDuRetrait,
  rangerProvinces,
} from '../src/lib/provinces';

describe('rangerProvinces', () => {
  it('range dans l’ordre alphabétique français, accents compris', () => {
    const rangees = rangerProvinces([
      { nom_de_la_province: 'Occitanie' },
      { nom_de_la_province: 'Île-de-France' },
      { nom_de_la_province: 'Bretagne' },
      { nom_de_la_province: 'Auvergne' },
    ]);
    expect(rangees.map((p) => p.nom_de_la_province)).toEqual(['Auvergne', 'Bretagne', 'Île-de-France', 'Occitanie']);
  });

  it('met les provinces sans nom à la fin — une reprise incomplète ne cache pas les autres', () => {
    const rangees = rangerProvinces([{ nom_de_la_province: null }, { nom_de_la_province: 'Bretagne' }, { nom_de_la_province: '  ' }, { nom_de_la_province: 'Alsace' }]);
    expect(rangees.map((p) => p.nom_de_la_province)).toEqual(['Alsace', 'Bretagne', null, '  ']);
  });

  it('ne touche pas à la liste reçue', () => {
    const liste = [{ nom_de_la_province: 'B' }, { nom_de_la_province: 'A' }];
    rangerProvinces(liste);
    expect(liste.map((p) => p.nom_de_la_province)).toEqual(['B', 'A']);
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

describe('questionDuRetrait', () => {
  it('dit combien de loges et de loges de Guyenne et Gascogne perdront leur province', () => {
    expect(questionDuRetrait({ nom_de_la_province: 'Bretagne', loges: 3, loges_du_reseau: 73 })).toBe(
      'Retirer la province « Bretagne » ?\n\n3 loges et 73 loges de Guyenne et Gascogne n’auront plus de province.',
    );
  });

  it('accorde au singulier', () => {
    expect(questionDuRetrait({ nom_de_la_province: 'Bretagne', loges: 1, loges_du_reseau: 0 })).toBe(
      'Retirer la province « Bretagne » ?\n\n1 loge n’aura plus de province.',
    );
    expect(questionDuRetrait({ nom_de_la_province: 'Bretagne', loges: 0, loges_du_reseau: 1 })).toBe(
      'Retirer la province « Bretagne » ?\n\n1 loge de Guyenne et Gascogne n’aura plus de province.',
    );
  });

  it('ne parle pas de loges quand aucune ne s’y rattache', () => {
    expect(questionDuRetrait({ nom_de_la_province: 'Bretagne', loges: 0, loges_du_reseau: 0 })).toBe(
      'Retirer la province « Bretagne » ?',
    );
  });

  it('nomme une province sans nom', () => {
    expect(questionDuRetrait({ nom_de_la_province: null, loges: 0, loges_du_reseau: 0 })).toBe(
      'Retirer la province « Province sans nom » ?',
    );
  });
});

describe('nomAffiche', () => {
  it('rend le nom, sans espaces autour, ou « Province sans nom »', () => {
    expect(nomAffiche('  Bretagne ')).toBe('Bretagne');
    expect(nomAffiche(null)).toBe('Province sans nom');
    expect(nomAffiche('   ')).toBe('Province sans nom');
  });
});

describe('lireProvincesAGerer', () => {
  const ligne = (nom: string | null, id = nom ?? 'x') => ({
    id,
    nom_de_la_province: nom,
    a_un_ecusson: false,
    maj_le: '2026-11-13T10:00:00+00:00',
    loges: 0,
    loges_du_reseau: 0,
  });

  it('range la liste reçue de la base', () => {
    expect(lireProvincesAGerer([ligne('Occitanie'), ligne(null), ligne('Alsace')]).map((p) => p.nom_de_la_province)).toEqual([
      'Alsace',
      'Occitanie',
      null,
    ]);
  });

  it('écarte une ligne mal formée, et ne casse pas sur une réponse qui n’est pas une liste', () => {
    expect(lireProvincesAGerer([ligne('Alsace'), { id: 'y', loges: -1 }])).toHaveLength(1);
    expect(lireProvincesAGerer(null)).toEqual([]);
    expect(lireProvincesAGerer({ provinces: [] })).toEqual([]);
  });
});

describe('ChampsDeLaProvince', () => {
  it('nettoie les espaces autour du nom', () => {
    expect(ChampsDeLaProvince.parse({ nom_de_la_province: '  Bretagne  ' })).toEqual({ nom_de_la_province: 'Bretagne' });
  });

  it('refuse un nom vide ou trop long, en français', () => {
    const vide = ChampsDeLaProvince.safeParse({ nom_de_la_province: '   ' });
    expect(vide.success).toBe(false);
    expect(vide.error?.issues[0]?.message).toBe('Le nom de la province est obligatoire.');
    const long = ChampsDeLaProvince.safeParse({ nom_de_la_province: 'x'.repeat(121) });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toMatch(/trop long/);
    expect(ChampsDeLaProvince.safeParse({}).error?.issues[0]?.message).toBe('Le nom de la province est obligatoire.');
  });

  it('refuse un champ de plus', () => {
    expect(ChampsDeLaProvince.safeParse({ nom_de_la_province: 'Bretagne', bubble_id: 'x' }).success).toBe(false);
  });
});

describe('adresseDeLEcusson', () => {
  it('change avec la version : un écusson remplacé n’est pas resservi depuis le cache', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(adresseDeLEcusson(id, '2026-11-13T10:00:00+00:00')).toBe(
      `/espace/provinces/${id}/image?v=2026-11-13T10%3A00%3A00%2B00%3A00`,
    );
    expect(adresseDeLEcusson(id, 'a')).not.toBe(adresseDeLEcusson(id, 'b'));
  });
});
