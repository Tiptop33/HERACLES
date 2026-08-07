import { describe, expect, it } from 'vitest';
import { accueilDuRole, estRoleInscription, libelleDuRole } from '../src/lib/roles';

describe('estRoleInscription', () => {
  it('accepte les deux rôles choisissables', () => {
    expect(estRoleInscription('chercheur')).toBe(true);
    expect(estRoleInscription('referent')).toBe(true);
  });

  it("refuse « admin » : ce rôle ne s'attribue pas à l'inscription", () => {
    expect(estRoleInscription('admin')).toBe(false);
  });

  it('refuse ce qui ne ressemble à rien', () => {
    expect(estRoleInscription('')).toBe(false);
    expect(estRoleInscription(undefined)).toBe(false);
    expect(estRoleInscription(42)).toBe(false);
    expect(estRoleInscription({ role: 'chercheur' })).toBe(false);
  });
});

describe('accueilDuRole', () => {
  it('envoie chacun dans son espace', () => {
    expect(accueilDuRole('chercheur')).toBe('/espace/chercheur');
    // Référents et administrateurs partagent l'accueil : c'est la colonne de
    // gauche qui les sépare ensuite, selon leurs droits.
    expect(accueilDuRole('referent')).toBe('/espace/accueil');
    expect(accueilDuRole('admin')).toBe('/espace/accueil');
  });

  it("retombe sur l'espace chercheur quand le rôle manque ou est inconnu", () => {
    expect(accueilDuRole(null)).toBe('/espace/chercheur');
    expect(accueilDuRole(undefined)).toBe('/espace/chercheur');
    expect(accueilDuRole('inconnu')).toBe('/espace/chercheur');
  });
});

describe('libelleDuRole', () => {
  it('affiche un libellé lisible', () => {
    expect(libelleDuRole('referent')).toBe('Référent');
    expect(libelleDuRole('admin')).toBe('Administrateur');
    expect(libelleDuRole('chercheur')).toBe('Chercheur');
    expect(libelleDuRole(null)).toBe('Chercheur');
  });
});
