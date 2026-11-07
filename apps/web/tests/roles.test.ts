import { describe, expect, it } from 'vitest';
import { accueilDuRole, estRoleInscription, libelleDuRole } from '../src/lib/roles';

describe('estRoleInscription', () => {
  it('accepte les deux rôles choisissables', () => {
    expect(estRoleInscription('candidat')).toBe(true);
    expect(estRoleInscription('referent')).toBe(true);
  });

  it("refuse « admin » : ce rôle ne s'attribue pas à l'inscription", () => {
    expect(estRoleInscription('admin')).toBe(false);
  });

  it('refuse ce qui ne ressemble à rien', () => {
    expect(estRoleInscription('')).toBe(false);
    expect(estRoleInscription(undefined)).toBe(false);
    expect(estRoleInscription(42)).toBe(false);
    expect(estRoleInscription({ role: 'candidat' })).toBe(false);
  });
});

describe('accueilDuRole', () => {
  it('envoie chacun dans son espace', () => {
    expect(accueilDuRole('candidat')).toBe('/espace/candidat');
    // Référents et administrateurs partagent l'accueil : c'est la colonne de
    // gauche qui les sépare ensuite, selon leurs droits.
    expect(accueilDuRole('referent')).toBe('/espace/accueil');
    expect(accueilDuRole('admin')).toBe('/espace/accueil');
  });

  it("retombe sur l'espace candidat quand le rôle manque ou est inconnu", () => {
    expect(accueilDuRole(null)).toBe('/espace/candidat');
    expect(accueilDuRole(undefined)).toBe('/espace/candidat');
    expect(accueilDuRole('inconnu')).toBe('/espace/candidat');
  });
});

describe('libelleDuRole', () => {
  it('affiche un libellé lisible', () => {
    expect(libelleDuRole('referent')).toBe('Référent');
    expect(libelleDuRole('admin')).toBe('Administrateur');
    expect(libelleDuRole('candidat')).toBe('Candidat');
    expect(libelleDuRole(null)).toBe('Candidat');
  });
});
