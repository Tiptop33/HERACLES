import { describe, expect, it } from 'vitest';
import { choixDeCollege, deplacerDans } from '../src/lib/college';

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

describe('deplacerDans', () => {
  const liste = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const ids = (l: { id: string }[]) => l.map((x) => x.id).join('');

  it('remonte un titre à la place de celui qu’on survole', () => {
    // Éprouvé aussi au navigateur : le 4e déposé sur le 1er donne bien dabc.
    expect(ids(deplacerDans(liste, 'd', 'a'))).toBe('dabc');
  });

  it('le descend de la même façon', () => {
    expect(ids(deplacerDans(liste, 'a', 'c'))).toBe('bcad');
  });

  it('ne bouge rien quand on dépose un titre sur lui-même', () => {
    expect(ids(deplacerDans(liste, 'b', 'b'))).toBe('abcd');
  });

  it('ne bouge rien quand un identifiant est inconnu', () => {
    // La liste a pu changer sous nos pieds : mieux vaut ne rien faire.
    expect(ids(deplacerDans(liste, 'z', 'a'))).toBe('abcd');
    expect(ids(deplacerDans(liste, 'a', 'z'))).toBe('abcd');
  });

  it('ne modifie pas la liste qu’on lui donne', () => {
    const depart = [...liste];
    deplacerDans(liste, 'd', 'a');
    expect(liste).toEqual(depart);
  });
});
