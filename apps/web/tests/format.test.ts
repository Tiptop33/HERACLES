import { describe, expect, it } from 'vitest';
import {
  dateEnLettres,
  datePourChamp,
  depuis,
  enEtiquettes,
  initiales,
  nomAffichable,
  nomComplet,
  telephone,
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

describe('nomAffichable', () => {
  it('préfère le nom quand il y en a un', () => {
    expect(nomAffichable('Ada', 'Lovelace', 'ada@example.org')).toBe('Ada Lovelace');
  });

  it('se contente du prénom, ou du nom', () => {
    expect(nomAffichable('Ada', null, 'ada@example.org')).toBe('Ada');
    expect(nomAffichable(null, 'Lovelace', 'ada@example.org')).toBe('Lovelace');
  });

  it('retombe sur l’adresse — un compte neuf n’a pas encore de nom', () => {
    // Celui du premier administrateur, par exemple : il n'est passé par aucun
    // formulaire. « Sans nom » sous la marque ne dit rien à personne.
    expect(nomAffichable(null, null, 'locascio@example.org')).toBe('locascio@example.org');
  });

  it('ne dit « Sans nom » qu’en dernier recours', () => {
    expect(nomAffichable(null, null, null)).toBe('Sans nom');
    expect(nomAffichable('  ', '  ', '   ')).toBe('Sans nom');
  });
});

describe('initiales, avec un secours', () => {
  it('prend la première lettre de l’adresse faute de nom', () => {
    expect(initiales(null, null, 'locascio@example.org')).toBe('L');
  });

  it('ignore le secours dès qu’un nom existe', () => {
    expect(initiales('Ada', 'Lovelace', 'zzz@example.org')).toBe('AL');
  });

  it('garde le point d’interrogation quand il n’y a rien du tout', () => {
    expect(initiales(null, null, null)).toBe('?');
  });
});

describe('telephone', () => {
  it('met un numéro français par paires', () => {
    expect(telephone('0612345678')?.affiche).toBe('06 12 34 56 78');
    expect(telephone('05 56 00 00 00')?.affiche).toBe('05 56 00 00 00');
  });

  it('accepte ce que Bubble a laissé : points, tirets, espaces insécables', () => {
    expect(telephone('06.12.34.56.78')?.affiche).toBe('06 12 34 56 78');
    expect(telephone('06-12-34-56-78')?.affiche).toBe('06 12 34 56 78');
    expect(telephone('06 12 34 56 78')?.affiche).toBe('06 12 34 56 78');
    expect(telephone(' (06) 12 34 56 78 ')?.affiche).toBe('06 12 34 56 78');
  });

  it('ramène l’indicatif international à la forme nationale', () => {
    expect(telephone('+33 6 12 34 56 78')?.affiche).toBe('06 12 34 56 78');
    expect(telephone('0033612345678')?.affiche).toBe('06 12 34 56 78');
  });

  it('compose sans espace, en international — c’est ce qui marche partout', () => {
    expect(telephone('06 12 34 56 78')?.lien).toBe('+33612345678');
  });

  it('reconnaît un numéro français, et lui seul', () => {
    expect(telephone('0612345678')?.francais).toBe(true);
    expect(telephone('+32 2 123 45 67')?.francais).toBe(false);
    // Neuf chiffres : il manque quelque chose. On ne devine pas.
    expect(telephone('612345678')?.francais).toBe(false);
    // Onze chiffres : ce n'est pas un numéro français non plus.
    expect(telephone('06123456789')?.francais).toBe(false);
    // 00 en tête n'existe pas comme préfixe de département.
    expect(telephone('0012345678')?.francais).toBe(false);
  });

  it('rend tel quel ce qu’il ne comprend pas, plutôt que de le mutiler', () => {
    // Un numéro étranger mal découpé serait pire qu'un numéro brut.
    expect(telephone('+32 2 123 45 67')?.affiche).toBe('+32 2 123 45 67');
    expect(telephone('poste 4512')?.affiche).toBe('poste 4512');
    expect(telephone('à demander')?.affiche).toBe('à demander');
  });

  it('ne rend rien quand il n’y a rien', () => {
    expect(telephone(null)).toBeNull();
    expect(telephone(undefined)).toBeNull();
    expect(telephone('   ')).toBeNull();
  });
});
