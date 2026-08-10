import { describe, expect, it } from 'vitest';
import { phraseDeRefusPoste } from '../src/lib/postes';

/**
 * Les routes ne renvoient qu'un code dans l'adresse : un message porté par
 * l'URL est un message qu'un lien fabriqué peut faire dire ce qu'il veut.
 * C'est ici que le code redevient une phrase.
 */
describe('les refus des postes à pourvoir', () => {
  it('dit ce qui manque, plutôt que « une erreur est survenue »', () => {
    expect(phraseDeRefusPoste('intitule')).toContain('intitulé');
    expect(phraseDeRefusPoste('sans-loge')).toContain('loge');
    expect(phraseDeRefusPoste('introuvable')).toContain('votre loge');
  });

  it('ne dit rien quand il n’y a rien à dire', () => {
    expect(phraseDeRefusPoste(null)).toBeNull();
    expect(phraseDeRefusPoste('')).toBeNull();
    expect(phraseDeRefusPoste(undefined)).toBeNull();
  });

  it('retombe sur une phrase utile pour un code inconnu', () => {
    // Un code inventé dans l'adresse ne doit pas produire « undefined ».
    expect(phraseDeRefusPoste('n-importe-quoi')).toBe(
      'Le poste n’a pas pu être enregistré.',
    );
  });
});
