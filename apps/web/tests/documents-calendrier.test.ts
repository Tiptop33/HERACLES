import { describe, expect, it } from 'vitest';
import { estFerie, joursFeries, mercredisDuMois, paques, prochaineReunion, reporter } from '../src/lib/documents/calendrier';

describe('les jours fériés', () => {
  it('calcule Pâques', () => {
    expect(paques(2026)).toBe('2026-04-05');
    expect(paques(2027)).toBe('2027-03-28');
    expect(paques(2030)).toBe('2030-04-21');
  });

  it('compte les onze jours fériés, dont ceux qui suivent Pâques', () => {
    const feries = joursFeries(2026);
    expect(feries.size).toBe(11);
    expect(feries.has('2026-04-06')).toBe(true); // Lundi de Pâques
    expect(feries.has('2026-05-14')).toBe(true); // Ascension
    expect(feries.has('2026-05-25')).toBe(true); // Lundi de Pentecôte
  });

  it('reconnaît le 11 novembre', () => {
    expect(estFerie('2026-11-11')).toBe(true);
    expect(estFerie('2026-11-12')).toBe(false);
  });
});

describe('les réunions : le 2e et le 4e mercredi', () => {
  it('trouve les deux mercredis du mois', () => {
    expect(mercredisDuMois(2026, 10)).toEqual(['2026-10-14', '2026-10-28']);
    expect(mercredisDuMois(2026, 11)).toEqual(['2026-11-11', '2026-11-25']);
    // Un mois qui commence un mercredi.
    expect(mercredisDuMois(2026, 7)).toEqual(['2026-07-08', '2026-07-22']);
  });

  it('reporte une réunion qui tombe un jour férié', () => {
    expect(reporter('2026-11-11', 'lendemain')).toBe('2026-11-12');
    expect(reporter('2026-11-11', 'semaine')).toBe('2026-11-18');
    expect(reporter('2026-11-11', 'aucun')).toBe('2026-11-11');
    expect(reporter('2026-11-25', 'lendemain')).toBe('2026-11-25');
  });

  it('annonce après le 28 octobre 2026 la réunion reportée, pas l’Armistice', () => {
    // Le cas réel : le compte rendu de Bubble annonçait le 11/11/2026.
    expect(prochaineReunion('2026-10-28')).toBe('2026-11-12');
    expect(prochaineReunion('2026-10-28', 'semaine')).toBe('2026-11-18');
    expect(prochaineReunion('2026-10-28', 'aucun')).toBe('2026-11-11');
  });

  it('enchaîne après une réunion reportée', () => {
    expect(prochaineReunion('2026-11-12')).toBe('2026-11-25');
  });

  it('passe l’année', () => {
    expect(prochaineReunion('2026-12-23')).toBe('2027-01-13');
  });

  it('ne se laisse pas tromper par une date illisible', () => {
    expect(prochaineReunion('pas une date')).toBeNull();
  });
});
