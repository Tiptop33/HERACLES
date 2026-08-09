import { describe, expect, it } from 'vitest';
import {
  ABSENT,
  EXCUSE,
  PRESENT,
  compter,
  estUnEtat,
  phraseDeRefusReunion,
  rangerParPresences,
  type LigneDAppel,
  type LigneDeRegistre,
} from '../src/lib/reunion';

/** Une ligne de feuille d'appel, réduite à ce que le comptage regarde. */
function ligne(etat: LigneDAppel['etat'], presences = 0, excuses = 0): LigneDAppel {
  return {
    referent_id: crypto.randomUUID(),
    nom: 'Abadie',
    prenom: 'Claire',
    college: null,
    a_une_photo: false,
    etat,
    presences,
    excuses,
  };
}

describe('compter', () => {
  it('ne compte rien sur une feuille vide', () => {
    expect(compter([])).toEqual({ presents: 0, excuses: 0, absents: 0, aAppeler: 0 });
  });

  it('range chaque état dans sa colonne', () => {
    const feuille = [ligne(PRESENT), ligne(PRESENT), ligne(EXCUSE), ligne(ABSENT)];
    expect(compter(feuille)).toEqual({ presents: 2, excuses: 1, absents: 1, aAppeler: 0 });
  });

  // La distinction qui porte tout l'écran : celui qu'on n'a pas encore appelé
  // n'est pas absent. Les confondre ferait croire l'appel terminé.
  it('sépare ceux qu’on n’a pas encore appelés des absents', () => {
    const feuille = [ligne(PRESENT), ligne(null), ligne(null), ligne(ABSENT)];
    const n = compter(feuille);
    expect(n.aAppeler).toBe(2);
    expect(n.absents).toBe(1);
  });
});

describe('estUnEtat', () => {
  it('reconnaît les trois états de Bubble, et rien d’autre', () => {
    expect(estUnEtat(PRESENT)).toBe(true);
    expect(estUnEtat(EXCUSE)).toBe(true);
    expect(estUnEtat(ABSENT)).toBe(true);
  });

  it('refuse tout le reste', () => {
    // Les états viennent d'un formulaire, donc de n'importe qui. La base les
    // refuserait aussi — mais on ne compte pas sur elle pour valider une
    // saisie qu'on peut écarter avant.
    for (const faux of ['present', 'Présente', '', null, undefined, 42, {}]) {
      expect(estUnEtat(faux), String(faux)).toBe(false);
    }
  });
});

/** Une ligne de registre, réduite à ce que le classement regarde. */
function seance(tenue_le: string, presents: number): LigneDeRegistre {
  return {
    id: crypto.randomUUID(),
    tenue_le,
    lieu: null,
    presents,
    excuses: 0,
    absents: 0,
    effectif: 12,
    retiree: false,
    retire_par_nom: null,
  };
}

describe('rangerParPresences', () => {
  it('met la réunion la plus suivie en tête', () => {
    const registre = [seance('2026-01-10', 3), seance('2026-02-10', 9), seance('2026-03-10', 6)];
    expect(rangerParPresences(registre).map((r) => r.presents)).toEqual([9, 6, 3]);
  });

  // Sans départage, l'ordre serait celui que la base a rendu : deux affichages
  // successifs ne se ressembleraient pas, et la liste paraîtrait bouger seule.
  it('départage deux réunions à égalité par la plus récente', () => {
    const registre = [seance('2026-01-10', 5), seance('2026-05-04', 5), seance('2026-03-10', 5)];
    expect(rangerParPresences(registre).map((r) => r.tenue_le)).toEqual([
      '2026-05-04',
      '2026-03-10',
      '2026-01-10',
    ]);
  });

  it('ne touche pas à la liste reçue', () => {
    const registre = [seance('2026-01-10', 1), seance('2026-02-10', 8)];
    rangerParPresences(registre);
    expect(registre.map((r) => r.presents)).toEqual([1, 8]);
  });

  it('ne bronche pas sur un registre vide', () => {
    expect(rangerParPresences([])).toEqual([]);
  });
});

describe('phraseDeRefusReunion', () => {
  it('ne dit rien quand rien n’a été refusé', () => {
    expect(phraseDeRefusReunion(null)).toBeNull();
    expect(phraseDeRefusReunion('')).toBeNull();
  });

  it('explique une loge manquante, qui est le refus le plus probable', () => {
    expect(phraseDeRefusReunion('sans-loge')).toContain('aucune loge');
  });

  // Le code vient de l'adresse : un code inventé ne doit pas afficher une
  // phrase inventée.
  it('retombe sur une phrase neutre pour un code inconnu', () => {
    expect(phraseDeRefusReunion('<script>')).toBe('L’appel n’a pas pu être enregistré.');
  });
});
