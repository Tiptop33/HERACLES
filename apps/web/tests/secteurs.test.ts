import { describe, expect, it } from 'vitest';
import {
  CODE_A_COCHER,
  cochesDessous,
  construireArbre,
  dateDeLaListe,
  lireCodesDuCandidat,
  lireListe,
  lireSecteursDuCandidat,
  listeAncienne,
  rangerParSection,
  resumeDeLaListe,
  type LigneNaf,
  type SecteurCoche,
} from '../src/lib/secteurs';

// Un morceau de nomenclature, assez pour une arborescence : la construction
// (F › 43 › 43.2 › 43.21 › 43.21A, 43.21B), et une classe dont la seule
// sous-classe répète l'intitulé (35.11 / 35.11Z).
const LIGNES: LigneNaf[] = [
  ['F', 'Construction', 1, null],
  ['D', 'Production et distribution d’électricité…', 1, null],
  ['43', 'Travaux de construction spécialisés', 2, 'F'],
  ['41', 'Construction de bâtiments', 2, 'F'],
  ['35', 'Production et distribution d’électricité…', 2, 'D'],
  ['43.2', 'Travaux d’installation électrique, plomberie…', 3, '43'],
  ['35.1', 'Production, transport et distribution d’électricité', 3, '35'],
  ['43.21', 'Installation électrique', 4, '43.2'],
  ['35.11', 'Production d’électricité', 4, '35.1'],
  ['43.21A', 'Travaux d’installation électrique dans tous locaux', 5, '43.21'],
  ['43.21B', 'Travaux d’installation électrique sur la voie publique', 5, '43.21'],
  ['35.11Z', 'Production d’électricité', 5, '35.11'],
];

const secteur = (code: string, section: string, niveau: SecteurCoche['niveau'] = 'division'): SecteurCoche => ({
  code,
  intitule: `Intitulé ${code}`,
  niveau,
  division: code.slice(0, 2),
  division_intitule: `Division ${code.slice(0, 2)}`,
  section,
  section_intitule: `Section ${section}`,
});

describe('la liste rendue par la base', () => {
  it('est lue quand elle a la bonne forme', () => {
    const liste = lireListe({ maj_le: null, modifiable: true, secteurs: [secteur('43', 'F')] });
    expect(liste?.secteurs[0].code).toBe('43');
  });

  it('est écartée sinon — mieux vaut pas de bloc qu’un bloc faux', () => {
    expect(lireListe(null)).toBeNull();
    expect(lireListe({ modifiable: true, secteurs: [] })).toBeNull();
    expect(lireListe({ maj_le: null, modifiable: true, secteurs: [{ code: '43' }] })).toBeNull();
  });
});

describe('les codes qu’une loge peut cocher', () => {
  it('de la division à la sous-classe', () => {
    for (const code of ['43', '43.2', '43.21', '43.21A']) expect(CODE_A_COCHER.test(code)).toBe(true);
  });

  it('ni une section seule, ni une forme fausse', () => {
    for (const code of ['F', '4', '43.', '43.2A', '43.21a', ' 43', '43.21AB', "43'; drop"]) {
      expect(CODE_A_COCHER.test(code)).toBe(false);
    }
  });
});

describe('ranger et résumer', () => {
  it('range par grand secteur, dans l’ordre des codes', () => {
    const groupes = rangerParSection([secteur('86', 'Q'), secteur('43.21A', 'F', 'sous-classe'), secteur('43', 'F')]);
    expect(groupes.map((g) => g.section)).toEqual(['F', 'Q']);
    expect(groupes[0].secteurs.map((s) => s.code)).toEqual(['43', '43.21A']);
  });

  it('dit combien, et dans combien de grands secteurs', () => {
    expect(resumeDeLaListe([])).toBe('');
    expect(resumeDeLaListe([secteur('43', 'F')])).toBe('1 secteur coché, dans 1 grand secteur.');
    expect(resumeDeLaListe([secteur('43', 'F'), secteur('41', 'F'), secteur('86', 'Q')])).toBe(
      '3 secteurs cochés, dans 2 grands secteurs.',
    );
  });
});

describe('la date de la liste', () => {
  const maintenant = new Date('2026-11-12T12:00:00Z');

  it('se signale au-delà de six mois', () => {
    expect(listeAncienne('2026-03-02T10:00:00Z', maintenant)).toBe(true);
    expect(listeAncienne('2026-10-01T10:00:00Z', maintenant)).toBe(false);
  });

  it('une liste jamais remplie n’est pas « ancienne » : elle est vide', () => {
    expect(listeAncienne(null, maintenant)).toBe(false);
    expect(dateDeLaListe(null)).toBe('Rien de coché pour l’instant');
  });

  it('s’écrit en toutes lettres, à l’heure de Paris', () => {
    expect(dateDeLaListe('2026-03-01T23:30:00Z')).toBe('Mis à jour le 2 mars 2026');
  });
});

describe('l’arborescence', () => {
  const arbre = construireArbre(LIGNES);

  it('part des grands secteurs, dans l’ordre', () => {
    expect(arbre.sections.map((l) => l[0])).toEqual(['D', 'F']);
    expect(arbre.enfants.get('F')?.map((l) => l[0])).toEqual(['41', '43']);
  });

  it('ne répète pas une sous-classe qui redit sa classe', () => {
    expect(arbre.enfants.get('35.11')).toBeUndefined();
    expect(arbre.enfants.get('43.21')?.map((l) => l[0])).toEqual(['43.21A', '43.21B']);
  });

  it('compte ce qui est coché dessous, la ligne elle-même exclue', () => {
    const coches = ['43', '43.21', '43.21A', '35'];
    expect(cochesDessous(arbre.parCode.get('F')!, coches, arbre)).toBe(3);
    expect(cochesDessous(arbre.parCode.get('43')!, coches, arbre)).toBe(2);
    expect(cochesDessous(arbre.parCode.get('43.21A')!, coches, arbre)).toBe(0);
    expect(cochesDessous(arbre.parCode.get('D')!, coches, arbre)).toBe(1);
  });
});

describe('les secteurs d’un candidat', () => {
  it('trois codes au plus, chacun une fois, section ou division', () => {
    expect(lireCodesDuCandidat('["43","H"]')).toEqual(['43', 'H']);
    expect(lireCodesDuCandidat('')).toEqual([]);
    expect(lireCodesDuCandidat(undefined)).toEqual([]);
    expect(lireCodesDuCandidat('["43","41","42","56"]')).toBeNull();
    expect(lireCodesDuCandidat('["43","43"]')).toBeNull();
    expect(lireCodesDuCandidat('["43.21A"]')).toBeNull();
    expect(lireCodesDuCandidat('pas du JSON')).toBeNull();
    expect(lireCodesDuCandidat('{"code":"43"}')).toBeNull();
  });

  it('la réponse de la base, vérifiée', () => {
    expect(
      lireSecteursDuCandidat({
        modifiable: true,
        repris_de_bubble: 'BTP',
        secteurs: [
          {
            rang: 1,
            code: '43',
            intitule: 'Travaux de construction spécialisés',
            niveau: 'division',
            section: 'F',
            section_intitule: 'Construction',
            propose_par: 'candidat',
            confirme_le: null,
            confirme_par: null,
          },
        ],
      })?.secteurs[0].code,
    ).toBe('43');
    expect(lireSecteursDuCandidat({ modifiable: true })).toBeNull();
  });
});
