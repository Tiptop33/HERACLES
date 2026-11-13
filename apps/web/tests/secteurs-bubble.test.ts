import { describe, expect, it } from 'vitest';
import {
  ReglageDuSecteurBubble,
  cibleDeLaLigne,
  compterSecteursBubble,
  dateCourte,
  filtrerSecteursBubble,
  libelleDeLaLigne,
  lireSecteursBubble,
  origineDeLaLigne,
  sousLeSecteur,
  type SecteurBubble,
} from '../src/lib/secteurs-bubble';

// Des secteurs Bubble inventés, comme ceux de la maquette.
const I = { code: 'I', intitule: 'Hébergement et restauration', niveau: 'section', section: 'I', section_intitule: 'Hébergement et restauration' } as const;
const D56 = { code: '56', intitule: 'Restauration', niveau: 'division', section: 'I', section_intitule: 'Hébergement et restauration' } as const;

const LIGNES: SecteurBubble[] = [
  { source: 'rome', valeur: 'r1', libelle: 'Hôtellerie - Restauration', fiches: 3, etat: 'a_valider', code: null, propose: { ...I, mot: 'restauration' }, valide_le: null },
  { source: 'rome', valeur: 'r2', libelle: null, fiches: 1, etat: 'a_valider', code: null, propose: null, valide_le: null },
  { source: 'texte', valeur: 'cuisine', libelle: 'Cuisine', fiches: 2, etat: 'valide', code: D56, propose: null, valide_le: '2026-11-13T22:30:00Z' },
  { source: 'texte', valeur: 'autre', libelle: 'Autre', fiches: 1, etat: 'sans', code: null, propose: null, valide_le: '2026-11-13T10:00:00Z' },
];

describe('les secteurs repris de Bubble', () => {
  it('lit ce que la base rend, et écarte une ligne mal formée', () => {
    expect(lireSecteursBubble(LIGNES)).toHaveLength(4);
    expect(lireSecteursBubble([...LIGNES, { source: 'metier', valeur: 'x' }])).toHaveLength(4);
    expect(lireSecteursBubble(null)).toEqual([]);
  });

  it('dit d’où vient chaque ligne, et combien de fiches la portent', () => {
    expect(origineDeLaLigne(LIGNES[0])).toBe('Bubble · liste ROME · 3 fiches');
    expect(origineDeLaLigne(LIGNES[1])).toBe('Bubble · liste ROME · 1 fiche');
    expect(origineDeLaLigne(LIGNES[2])).toBe('Bubble · texte libre · 2 fiches');
  });

  it('nomme un secteur ROME dont la liste n’a pas été reprise', () => {
    expect(libelleDeLaLigne(LIGNES[1])).toBe('Intitulé absent de la reprise');
    expect(libelleDeLaLigne(LIGNES[0])).toBe('Hôtellerie - Restauration');
  });

  it('montre le secteur retenu, sinon le secteur proposé, et rien pour « aucun ne convient »', () => {
    expect(cibleDeLaLigne(LIGNES[0])?.code).toBe('I');
    expect(cibleDeLaLigne(LIGNES[1])).toBeNull();
    expect(cibleDeLaLigne(LIGNES[2])?.code).toBe('56');
    expect(cibleDeLaLigne(LIGNES[3])).toBeNull();
    expect(sousLeSecteur(I)).toBe('grand secteur');
    expect(sousLeSecteur(D56)).toBe('I — Hébergement et restauration');
  });

  it('compte et filtre comme les compteurs et les pastilles de l’écran', () => {
    expect(compterSecteursBubble(LIGNES)).toEqual({ total: 4, valides: 1, a_valider: 2, sans: 1 });
    expect(filtrerSecteursBubble(LIGNES, 'a_valider').map((l) => l.valeur)).toEqual(['r1', 'r2']);
    expect(filtrerSecteursBubble(LIGNES, 'valide').map((l) => l.valeur)).toEqual(['cuisine']);
    expect(filtrerSecteursBubble(LIGNES, 'sans').map((l) => l.valeur)).toEqual(['autre']);
    expect(filtrerSecteursBubble(LIGNES, 'tous')).toHaveLength(4);
  });

  it('date à l’heure de Paris : 23 h 30 UTC le 13, c’est déjà le 14', () => {
    expect(dateCourte('2026-11-13T23:30:00Z')).toBe('14 nov.');
    expect(dateCourte('2026-11-13T22:30:00Z')).toBe('13 nov.');
    expect(dateCourte(null)).toBeNull();
    expect(dateCourte('pas une date')).toBeNull();
  });

  it('n’accepte qu’une section, une division, ou rien', () => {
    const ok = (code: string | null) => ReglageDuSecteurBubble.safeParse({ source: 'rome', valeur: 'r1', code }).success;
    expect(ok('F')).toBe(true);
    expect(ok('43')).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok('43.21')).toBe(false);
    expect(ok('43.21A')).toBe(false);
    expect(ok('f')).toBe(false);
    expect(ReglageDuSecteurBubble.safeParse({ source: 'metier', valeur: 'r1', code: 'F' }).success).toBe(false);
    expect(ReglageDuSecteurBubble.safeParse({ source: 'rome', valeur: '  ', code: 'F' }).success).toBe(false);
    expect(ReglageDuSecteurBubble.safeParse({ source: 'rome', valeur: 'r1', code: 'F', autre: 1 }).success).toBe(false);
  });
});
