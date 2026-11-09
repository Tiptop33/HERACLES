import { describe, expect, it } from 'vitest';
import { nomDeLAffiche } from '../src/lib/documents/affiche';
import { nomDeLAffichette } from '../src/lib/documents/affichette';
import { marque, nomDuCompteRendu } from '../src/lib/documents/compte-rendu';
import {
  article,
  couper,
  dateAbregee,
  dateLongue,
  jourCourt,
  jourEntier,
  personne,
  telephoneLisible,
  variablesDeLaCommission,
} from '../src/lib/documents/formats';

describe('les dates, comme les documents de Bubble les écrivaient', () => {
  it('écrit la date de l’affiche en toutes lettres', () => {
    expect(dateLongue('2026-10-14')).toBe('mercredi 14 octobre 2026');
  });

  it('écrit la date du compte rendu à la manière de Bubble', () => {
    expect(dateAbregee('2026-10-28')).toBe('Mer 28 Octobre, 2026');
  });

  it('écrit les colonnes DATE avec et sans le siècle', () => {
    expect(jourEntier('2025-11-27')).toBe('27/11/2025');
    expect(jourCourt('2025-11-27')).toBe('27/11/25');
  });

  it('lit une date sans se soucier du fuseau du serveur', () => {
    expect(jourEntier('2026-01-01T00:00:00+00:00')).toBe('01/01/2026');
  });

  it('rend vide une date absente ou illisible', () => {
    expect(jourEntier(null)).toBe('');
    expect(dateLongue('demain')).toBe('');
  });
});

describe('les noms des fichiers', () => {
  it('nomme le compte rendu et l’affiche à la date de la réunion', () => {
    expect(nomDuCompteRendu('2026-10-28')).toBe('Compte-Rendu du 28-10-2026.pdf');
    expect(nomDeLAffiche('2026-10-28')).toBe('Affiche du 28-10-2026.pdf');
  });

  it('nomme l’affichette du numéro et du jour où elle est tirée', () => {
    expect(nomDeLAffichette(856, new Date('2026-11-09T17:09:59Z'))).toBe('856 du 09-11-2026.pdf');
    // Tirée à 0 h 30 à Paris : c'est déjà le lendemain, même si l'UTC dit la veille.
    expect(nomDeLAffichette(856, new Date('2026-11-09T23:30:00Z'))).toBe('856 du 10-11-2026.pdf');
  });
});

describe('la coupe de la définition de l’emploi', () => {
  it('coupe au dernier mot entier, puis ajoute des points de suspension', () => {
    expect(couper('Consultant RH / Gestion de carrière et recrutement', 30)).toBe('Consultant RH / Gestion de...');
  });

  it('laisse entier un texte qui tient', () => {
    expect(couper('Chef de projet digital', 35)).toBe('Chef de projet digital');
  });

  it('coupe un mot plus long que la limite plutôt que de rendre vide', () => {
    expect(couper('Anticonstitutionnellement', 10)).toBe('Anticonsti...');
  });

  it('ne laisse pas de virgule pendante avant les points', () => {
    expect(couper('Assistante, secrétaire, comptable', 12)).toBe('Assistante...');
  });
});

describe('les personnes et les données de la commission', () => {
  it('écrit « Prénom NOM »', () => {
    expect(personne('Jeanne', 'Dupont')).toBe('Jeanne DUPONT');
    expect(personne(null, 'Dupont')).toBe('DUPONT');
    expect(personne(null, null)).toBe('');
  });

  it('accorde l’article à ce qui est recherché', () => {
    expect(article('Emploi')).toBe('un');
    expect(article('Stage')).toBe('un');
    expect(article('Alternance')).toBe('une');
  });

  it('met le téléphone en paires', () => {
    expect(telephoneLisible('0612345678')).toBe('06 12 34 56 78');
    expect(telephoneLisible(null)).toBe('');
  });

  it('remplit les variables communes, vides quand la loge n’a pas d’officier', () => {
    const v = variablesDeLaCommission({
      loge_nom: 'HERACLES',
      venerable_prenom: 'Prénom',
      venerable_nom: 'Nom',
      venerable_telephone: '0600000001',
      venerable_email: 'p@exemple.org',
      secretaire_prenom: null,
      secretaire_nom: null,
      secretaire_telephone: null,
      secretaire_email: null,
    });
    expect(v.commission).toBe('HERACLES');
    expect(v.venerable).toBe('Prénom NOM');
    expect(v.venerable_telephone).toBe('06 00 00 00 01');
    expect(v.secretaire).toBe('');
  });

  it('abrège l’état du jour comme le document d’origine', () => {
    expect(marque('Présent')).toBe('P');
    expect(marque('Excusé')).toBe('E');
    expect(marque('Absent')).toBe('A');
    expect(marque(null)).toBe('');
  });
});
