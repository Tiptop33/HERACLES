import { describe, expect, it } from 'vitest';
import { REGLES, force, premiereFaute, reglesTenues } from '../src/lib/motdepasse';

describe('les règles affichées', () => {
  it('sont les trois de la maquette, dans l’ordre', () => {
    expect(REGLES.map((r) => r.intitule)).toEqual([
      '12 caractères minimum',
      '1 majuscule et 1 chiffre',
      'Différent des 3 derniers',
    ]);
  });

  it('laisse à la base celle qu’elle seule peut vérifier', () => {
    expect(REGLES[2].respectee).toBeNull();
  });
});

describe('reglesTenues', () => {
  it('refuse un mot de passe trop court', () => {
    expect(reglesTenues('Court1')).toBe(false);
    expect(premiereFaute('Court1')).toBe('12 caractères minimum');
  });

  it('refuse un mot de passe sans majuscule ni chiffre', () => {
    expect(reglesTenues('bonjourbonjour')).toBe(false);
    expect(premiereFaute('bonjourbonjour')).toBe('1 majuscule et 1 chiffre');
  });

  it('refuse un mot de passe sans chiffre', () => {
    expect(reglesTenues('Bonjourbonjour')).toBe(false);
  });

  it('accepte une majuscule accentuée — des gens s’appellent Étienne', () => {
    expect(reglesTenues('Étienne12345')).toBe(true);
  });

  it('accepte quand les deux règles vérifiables sont tenues', () => {
    expect(reglesTenues('Bordeaux2026!')).toBe(true);
    expect(premiereFaute('Bordeaux2026!')).toBeNull();
  });
});

describe('force', () => {
  it('vaut zéro sur un champ vide', () => {
    expect(force('')).toBe(0);
  });

  it('reste au premier segment tant que la longueur n’y est pas', () => {
    expect(force('Aa1!')).toBe(1);
    expect(force('Aa1!Aa1!Aa')).toBe(1);
  });

  it('monte avec la longueur et la variété', () => {
    expect(force('bordeauxbordeaux')).toBeGreaterThanOrEqual(1);
    expect(force('Bordeaux2026')).toBeGreaterThan(force('bordeauxbord'));
    expect(force('Bordeaux2026!!!!')).toBe(4);
  });

  it('ne dépasse jamais quatre segments', () => {
    expect(force('Bordeaux2026!!!!!!!!!!!!!!!!!!!!')).toBe(4);
  });
});
