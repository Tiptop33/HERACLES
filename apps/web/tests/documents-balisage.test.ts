import { describe, expect, it } from 'vitest';
import { analyser, enClair, remplir, retirerLesLignesVides, substituer, variablesEmployees } from '../src/lib/documents/balisage';

describe('le balisage des textes de la mise en page', () => {
  it('découpe le gras et l’italique', () => {
    expect(analyser('La commission **HERACLES** est *très* sollicitée')).toEqual([
      { texte: 'La commission ', gras: false, italique: false },
      { texte: 'HERACLES', gras: true, italique: false },
      { texte: ' est ', gras: false, italique: false },
      { texte: 'très', gras: false, italique: true },
      { texte: ' sollicitée', gras: false, italique: false },
    ]);
  });

  it('garde un texte sans balise d’un seul tenant', () => {
    expect(analyser('Mes BCFF')).toEqual([{ texte: 'Mes BCFF', gras: false, italique: false }]);
  });

  it('remplace les variables, et laisse visible celle qu’il ne connaît pas', () => {
    expect(substituer('Dossier {numero} — {inconnue}', { numero: 856 })).toBe('Dossier 856 — {inconnue}');
  });

  it('ne laisse pas une donnée glisser du balisage dans le document', () => {
    // Un intitulé saisi par un candidat : ses astérisques restent du texte.
    const morceaux = remplir('Recherche : {intitule}', { intitule: 'Chef de projet **senior**' });
    expect(morceaux).toEqual([{ texte: 'Recherche : Chef de projet **senior**', gras: false, italique: false }]);
  });

  it('retire une ligne dont toutes les données sont vides', () => {
    const modele = '**{venerable}**, Président\n**{secretaire}**, Secrétariat\nTexte fixe';
    expect(retirerLesLignesVides(modele, { venerable: 'Prénom NOM', secretaire: '' })).toBe(
      '**{venerable}**, Président\nTexte fixe',
    );
  });

  it('garde une ligne dont une donnée au moins est remplie', () => {
    expect(retirerLesLignesVides('{a} et {b}', { a: '', b: 'x' })).toBe('{a} et {b}');
  });

  it('rend le texte en clair', () => {
    expect(enClair('Recherche {article} **{type}**', { article: 'une', type: 'alternance' })).toBe('Recherche une alternance');
  });

  it('dit quelles variables un modèle emploie', () => {
    expect(variablesEmployees('{a} {b} {a}')).toEqual(['a', 'b']);
  });
});
