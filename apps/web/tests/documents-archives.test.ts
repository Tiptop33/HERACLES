import { describe, expect, it } from 'vitest';
import {
  aujourdhuiAParis,
  jourEnChiffres,
  periodeDesDocuments,
  phraseDeRefusDocument,
  rangerParSorte,
  titreDeLAffiche,
  titreDeLAffichette,
  titreDuCompteRendu,
  type DocumentArchive,
} from '../src/lib/documents/archives';

describe('les noms des PDF archivés', () => {
  it('écrit la date en chiffres, sans la décaler', () => {
    expect(jourEnChiffres('2026-10-28')).toBe('28-10-2026');
    // Une date civile se lit telle quelle, même accompagnée d'une heure.
    expect(jourEnChiffres('2026-10-28T23:59:00Z')).toBe('28-10-2026');
  });

  it('nomme chaque document comme la commission les nomme', () => {
    expect(titreDuCompteRendu('2026-10-28')).toBe('Compte-Rendu du 28-10-2026');
    expect(titreDeLAffiche('2026-10-28')).toBe('Affiche du 28-10-2026');
    expect(titreDeLAffichette(856, new Date('2026-11-09T10:00:00Z'))).toBe('856 du 09-11-2026');
  });

  it('nomme quand même une affichette sans numéro', () => {
    expect(titreDeLAffichette(null, '2026-11-09')).toBe('Dossier du 09-11-2026');
  });

  it('donne le jour à Paris, pas en UTC', () => {
    expect(aujourdhuiAParis(new Date('2026-11-09T23:30:00Z'))).toBe('2026-11-10');
    expect(aujourdhuiAParis(new Date('2026-07-31T21:59:00Z'))).toBe('2026-07-31');
  });
});

describe('la période de l’accueil', () => {
  it('suit l’exercice réglé dans Paramètres › Exercice', () => {
    expect(
      periodeDesDocuments({ debut: '2026-09-01', fin: '2027-07-31' }, '2026-11-09'),
    ).toEqual({ du: '2026-09-01', au: '2027-07-31' });
    expect(
      periodeDesDocuments({ debut: '2026-09-15', fin: '2027-06-30' }, '2026-11-09'),
    ).toEqual({ du: '2026-09-15', au: '2027-06-30' });
  });

  it('même dépassé : c’est l’onglet qui dit quel est l’exercice', () => {
    expect(
      periodeDesDocuments({ debut: '2025-09-01', fin: '2026-07-31' }, '2026-11-09'),
    ).toEqual({ du: '2025-09-01', au: '2026-07-31' });
  });

  it('prend la saison, du 1er septembre au 31 juillet, tant qu’aucune date n’est réglée', () => {
    expect(periodeDesDocuments({ debut: null, fin: null }, '2027-03-02')).toEqual({
      du: '2026-09-01',
      au: '2027-07-31',
    });
    expect(periodeDesDocuments({ debut: '2026-09-01', fin: null }, '2026-11-09').du).toBe(
      '2026-09-01',
    );
  });

  it('bascule de saison en septembre, pas en janvier', () => {
    expect(periodeDesDocuments({ debut: null, fin: null }, '2027-08-31').du).toBe('2026-09-01');
    expect(periodeDesDocuments({ debut: null, fin: null }, '2027-09-01').du).toBe('2027-09-01');
  });
});

describe('les trois colonnes', () => {
  const ligne = (id: string, type_document: string): DocumentArchive => ({
    id,
    nom: id,
    type_document: type_document as DocumentArchive['type_document'],
    date_document: '2026-10-28',
    effacable: false,
  });

  it('range chaque PDF dans sa colonne, dans l’ordre reçu', () => {
    const colonnes = rangerParSorte([
      ligne('cr-2', 'compte-rendu'),
      ligne('af-1', 'affiche'),
      ligne('cr-1', 'compte-rendu'),
      ligne('at-1', 'affichette'),
    ]);
    expect(colonnes['compte-rendu'].map((d) => d.id)).toEqual(['cr-2', 'cr-1']);
    expect(colonnes.affiche.map((d) => d.id)).toEqual(['af-1']);
    expect(colonnes.affichette.map((d) => d.id)).toEqual(['at-1']);
  });

  it('n’accueille pas une sorte qu’aucune colonne n’annonce', () => {
    const colonnes = rangerParSorte([ligne('cva-1', 'cva')]);
    expect(Object.values(colonnes).flat()).toEqual([]);
  });
});

describe('les refus de la corbeille', () => {
  it('traduit un code connu, et ne répète jamais ce que dit l’adresse', () => {
    expect(phraseDeRefusDocument('droit')).toMatch(/Vénérable Maître/);
    expect(phraseDeRefusDocument('<script>')).toBe(phraseDeRefusDocument('echec'));
    expect(phraseDeRefusDocument('')).toBeNull();
  });
});
