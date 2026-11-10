import { describe, expect, it } from 'vitest';
import { elements, familleDeRecherche, jourEnLettres, numeroEcrit, parcours, permisLisible } from '../src/lib/documents/cv-anonyme';

/**
 * La lecture des champs de la fiche pour le CV anonyme. Les fiches viennent de
 * deux mondes — la lecture du CV, qui écrit « 2019-2025 — Poste, employeur :
 * missions », et Bubble, où chacun a tapé comme il voulait : les deux doivent
 * donner un CV lisible.
 */

describe('le parcours', () => {
  it('découpe la forme de la lecture du CV', () => {
    expect(parcours('2019-2025 — Directeur de travaux, PME du bâtiment, Pau : pilotage des chantiers')).toEqual([
      { periode: '2019 – 2025', intitule: 'Directeur de travaux', lieu: 'PME du bâtiment, Pau', detail: 'Pilotage des chantiers' },
    ]);
  });

  it('garde entière une ligne tapée autrement', () => {
    expect(parcours('Vendeuse en boulangerie pendant deux ans')).toEqual([
      { periode: '', intitule: 'Vendeuse en boulangerie pendant deux ans', lieu: '', detail: '' },
    ]);
  });

  it('ne prend pas un tiret d’intitulé pour une période', () => {
    expect(parcours('Agent d’accueil — mairie')[0].periode).toBe('');
  });

  it('ignore les lignes vides et les espaces en trop', () => {
    expect(parcours('\n  2011 —   BTS  Bâtiment  \n\n')).toEqual([{ periode: '2011', intitule: 'BTS Bâtiment', lieu: '', detail: '' }]);
  });
});

describe('les listes', () => {
  it('une ligne par élément', () => {
    expect(elements('Rigueur\nÉcoute')).toEqual(['Rigueur', 'Écoute']);
  });

  it('ou des virgules sur une seule ligne, sans couper les parenthèses', () => {
    expect(elements('excel, Word ; anglais (lu, écrit)')).toEqual(['Excel', 'Word', 'Anglais (lu, écrit)']);
  });
});

describe('les petits champs', () => {
  it('range les mots de Bubble par famille', () => {
    expect(familleDeRecherche('stage en alternance')).toBe('alternance');
    expect(familleDeRecherche('changement d’Emploi')).toBe('changement');
    expect(familleDeRecherche("changement d'Emploi")).toBe('changement');
    expect(familleDeRecherche('stage')).toBe('stage');
    expect(familleDeRecherche('emploi')).toBe('emploi');
    expect(familleDeRecherche(null)).toBeNull();
  });

  it('dit le permis s’il est là, et seulement alors', () => {
    expect(permisLisible('Oui', 'Oui')).toBe('Permis B, véhiculé');
    expect(permisLisible('Oui', 'Non')).toBe('Permis B, sans véhicule');
    expect(permisLisible('Oui', null)).toBe('Permis B');
    expect(permisLisible('Non', 'Oui')).toBeNull();
    expect(permisLisible(null, null)).toBeNull();
    expect(permisLisible('En cours', null)).toBe('Permis B : En cours');
  });

  it('écrit les dates en lettres', () => {
    expect(jourEnLettres('2027-04-06T00:00:00+00:00')).toBe('6 avril 2027');
    expect(jourEnLettres('2027-04-01')).toBe('1er avril 2027');
    expect(jourEnLettres('n’importe quoi')).toBe('');
  });

  it('écrit le numéro des trois façons', () => {
    expect(numeroEcrit(904, 'n')).toEqual({ avant: 'N°', chiffres: '904' });
    expect(numeroEcrit(904, 'nu')).toEqual({ avant: '', chiffres: '904' });
    expect(numeroEcrit(904, 'dossier')).toEqual({ avant: 'Dossier', chiffres: '904' });
    expect(numeroEcrit(null, 'n').chiffres).toBe('—');
  });
});
