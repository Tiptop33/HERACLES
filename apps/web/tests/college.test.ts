import { describe, expect, it } from 'vitest';
import { choixDeCollege } from '../src/lib/college';

const liste = ['Vénérable Maître', 'Secrétaire', 'Trésorier'];

describe('choixDeCollege', () => {
  it('propose la liste telle quelle quand la fiche n’a pas de titre', () => {
    expect(choixDeCollege(liste, null)).toEqual(liste);
    expect(choixDeCollege(liste, '   ')).toEqual(liste);
  });

  it('ne double pas un titre déjà dans la liste', () => {
    expect(choixDeCollege(liste, 'Secrétaire')).toEqual(liste);
    // Une majuscule d'écart ne fait pas un titre de plus, comme en base.
    expect(choixDeCollege(liste, 'secrétaire')).toEqual(liste);
  });

  it('garde le titre que porte la fiche, même retiré de la liste', () => {
    // Sans cela, ouvrir une fiche et l'enregistrer sans y toucher effacerait
    // son titre : le menu déroulant aurait choisi à la place de la personne.
    expect(choixDeCollege(liste, 'Expert')).toEqual([...liste, 'Expert']);
  });

  it('fonctionne sur une liste vide', () => {
    expect(choixDeCollege([], 'Expert')).toEqual(['Expert']);
    expect(choixDeCollege([], null)).toEqual([]);
  });
});
