import { describe, expect, it } from 'vitest';
import {
  dateEnLettres,
  datePourChamp,
  depuis,
  enEtiquettes,
  initiales,
  nomComplet,
} from '../src/lib/format';

describe('initiales', () => {
  it('prend la première lettre du prénom et du nom', () => {
    expect(initiales('Alice', 'Martin')).toBe('AM');
    expect(initiales('karim', 'benali')).toBe('KB');
  });

  it('se contente de ce qu’elle a', () => {
    expect(initiales('Alice', null)).toBe('A');
    expect(initiales(null, 'Martin')).toBe('M');
  });

  it('affiche un point d’interrogation plutôt que rien', () => {
    expect(initiales(null, null)).toBe('?');
    expect(initiales('  ', '')).toBe('?');
  });
});

describe('nomComplet', () => {
  it('assemble prénom et nom', () => {
    expect(nomComplet('Alice', 'Martin')).toBe('Alice Martin');
  });

  it('nomme les fiches sans nom plutôt que de les laisser vides', () => {
    expect(nomComplet(null, null)).toBe('Sans nom');
    expect(nomComplet('  ', null)).toBe('Sans nom');
  });
});

describe('dateEnLettres', () => {
  it('écrit la date en toutes lettres', () => {
    expect(dateEnLettres('2026-03-12T10:00:00Z')).toBe('12 mars 2026');
  });

  it('écrit « 1er » le premier du mois', () => {
    expect(dateEnLettres('2026-09-01T08:00:00Z')).toBe('1er septembre 2026');
  });

  it('ne rend rien quand il n’y a pas de date', () => {
    expect(dateEnLettres(null)).toBeNull();
    expect(dateEnLettres('pas une date')).toBeNull();
  });
});

describe('datePourChamp', () => {
  it('rend le format attendu par un champ date', () => {
    expect(datePourChamp('2026-09-01T08:00:00Z')).toBe('2026-09-01');
  });

  it('rend une chaîne vide quand il n’y a pas de date', () => {
    expect(datePourChamp(null)).toBe('');
  });
});

describe('depuis', () => {
  const maintenant = new Date('2026-08-05T12:00:00Z');

  it('dit les tout premiers jours comme on les dit', () => {
    expect(depuis('2026-08-05T09:00:00Z', maintenant)).toBe("aujourd'hui");
    expect(depuis('2026-08-04T09:00:00Z', maintenant)).toBe('hier');
  });

  it('compte les jours ensuite', () => {
    expect(depuis('2026-08-03T09:00:00Z', maintenant)).toBe('il y a 2 jours');
    expect(depuis('2026-07-31T09:00:00Z', maintenant)).toBe('il y a 5 jours');
  });

  it('passe aux mois, puis aux années', () => {
    expect(depuis('2026-07-01T09:00:00Z', maintenant)).toBe('il y a 1 mois');
    expect(depuis('2026-02-01T09:00:00Z', maintenant)).toBe('il y a 6 mois');
    expect(depuis('2025-01-01T09:00:00Z', maintenant)).toBe('il y a 1 an');
    expect(depuis('2023-01-01T09:00:00Z', maintenant)).toBe('il y a 3 ans');
  });

  it('ne rend rien quand il n’y a pas de date', () => {
    expect(depuis(null, maintenant)).toBeNull();
  });
});

describe('enEtiquettes', () => {
  it('découpe sur les séparateurs que Bubble mélangeait', () => {
    expect(enEtiquettes('Sage, Excel avancé; Cegid\nRigoureuse · Autonome')).toEqual([
      'Sage',
      'Excel avancé',
      'Cegid',
      'Rigoureuse',
      'Autonome',
    ]);
  });

  it('jette les morceaux vides', () => {
    expect(enEtiquettes('Sage,,  ,Cegid')).toEqual(['Sage', 'Cegid']);
    expect(enEtiquettes(null)).toEqual([]);
    expect(enEtiquettes('')).toEqual([]);
  });
});
