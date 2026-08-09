import { describe, expect, it } from 'vitest';
import { ouEnEstLExercice, phraseDeRefusExercice } from '../src/lib/exercice';

describe('ouEnEstLExercice', () => {
  const exercice = { debut: '2025-09-01', fin: '2026-08-31' };

  it('reconnaît un exercice en cours', () => {
    expect(ouEnEstLExercice(exercice, '2026-08-09')).toBe('en-cours');
  });

  // Les deux bornes comptent : une réunion tenue le jour de la clôture entre
  // encore dans l'exercice, comme en base (`between`).
  it('inclut ses deux bornes', () => {
    expect(ouEnEstLExercice(exercice, '2025-09-01')).toBe('en-cours');
    expect(ouEnEstLExercice(exercice, '2026-08-31')).toBe('en-cours');
  });

  // Le cas qui a fait écrire cet écran : l'exercice s'était terminé le
  // 31 juillet 2026, et rien nulle part ne le disait.
  it('voit qu’un exercice est terminé', () => {
    expect(ouEnEstLExercice({ debut: '2025-09-01', fin: '2026-07-31' }, '2026-08-09')).toBe(
      'termine',
    );
  });

  it('voit qu’un exercice n’a pas commencé', () => {
    expect(ouEnEstLExercice(exercice, '2025-06-30')).toBe('a-venir');
  });

  it('ne tranche pas quand une borne manque', () => {
    expect(ouEnEstLExercice({ debut: null, fin: '2026-08-31' }, '2026-08-09')).toBe('inconnu');
    expect(ouEnEstLExercice({ debut: '2025-09-01', fin: null }, '2026-08-09')).toBe('inconnu');
    expect(ouEnEstLExercice({ debut: null, fin: null }, '2026-08-09')).toBe('inconnu');
  });
});

describe('phraseDeRefusExercice', () => {
  it('ne dit rien quand rien n’a été refusé', () => {
    expect(phraseDeRefusExercice(null)).toBeNull();
    expect(phraseDeRefusExercice('')).toBeNull();
  });

  it('explique une fin qui précède son début', () => {
    expect(phraseDeRefusExercice('ordre')).toContain('après son début');
  });

  // Le code vient de l'adresse : un code inventé ne doit pas afficher une
  // phrase inventée.
  it('retombe sur une phrase neutre pour un code inconnu', () => {
    expect(phraseDeRefusExercice('<script>')).toBe(
      'Les dates n’ont pas pu être enregistrées.',
    );
  });
});
