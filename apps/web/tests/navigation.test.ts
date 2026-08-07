import { describe, expect, it } from 'vitest';
import { FAMILLES, PARAMETRES, estCourante, famillesDuRole } from '../src/lib/navigation';

describe('les cinq familles', () => {
  it('sont celles de la maquette, dans l’ordre', () => {
    expect(FAMILLES.map((f) => f.nom)).toEqual([
      'Suivi',
      'Emploi',
      'Réseau',
      'Pilotage',
      'Admin',
    ]);
  });

  it('reprennent les dix-sept entrées de l’application Bubble', () => {
    const total = FAMILLES.reduce((n, f) => n + f.entrees.length, 0);
    expect(total).toBe(16); // les 17 moins « Accueil », qui reste seul en tête
  });
});

describe('famillesDuRole', () => {
  it('cache Admin à un référent — une porte visible est une invitation à pousser', () => {
    const noms = famillesDuRole('referent').map((f) => f.nom);
    expect(noms).not.toContain('Admin');
    expect(noms).toEqual(['Suivi', 'Emploi', 'Réseau', 'Pilotage']);
  });

  it('la montre à un administrateur', () => {
    expect(famillesDuRole('admin').map((f) => f.nom)).toContain('Admin');
  });

  it('ne laisse aucune adresse d’administration à portée d’un référent', () => {
    const adresses = famillesDuRole('referent')
      .flatMap((f) => f.entrees)
      .map((e) => e.vers)
      .filter(Boolean);
    expect(adresses.some((a) => a?.startsWith('/espace/admin'))).toBe(false);
  });
});

describe('estCourante', () => {
  it('reconnaît la page elle-même', () => {
    expect(estCourante({ libelle: 'Candidats', vers: '/espace/referent' }, '/espace/referent')).toBe(
      true,
    );
  });

  it('garde « Candidats » allumé sur la fiche d’un candidat', () => {
    expect(
      estCourante(
        { libelle: 'Candidats', vers: '/espace/referent' },
        '/espace/referent/candidats/abc/modifier',
      ),
    ).toBe(true);
  });

  it('ne confond pas deux chemins qui commencent pareil', () => {
    expect(
      estCourante({ libelle: 'Candidats', vers: '/espace/referent' }, '/espace/referents-autre'),
    ).toBe(false);
  });

  it('n’allume jamais une entrée qui ne mène nulle part', () => {
    expect(estCourante({ libelle: 'Bilan', vers: null }, '/espace/accueil')).toBe(false);
  });
});

describe('PARAMETRES', () => {
  it('est à part : aucune famille ne la contient', () => {
    const partout = FAMILLES.flatMap((f) => f.entrees.map((e) => e.libelle));
    expect(partout).not.toContain(PARAMETRES.libelle);
  });

  it('mène quelque part — une roue crantée éteinte ne servirait à rien', () => {
    expect(PARAMETRES.vers).toBe('/espace/parametres');
  });

  it('s’allume sur son écran, et sur les pages qui en dépendent', () => {
    expect(estCourante(PARAMETRES, '/espace/parametres')).toBe(true);
    expect(estCourante(PARAMETRES, '/espace/parametres/college')).toBe(true);
    expect(estCourante(PARAMETRES, '/espace/referents')).toBe(false);
  });
});
