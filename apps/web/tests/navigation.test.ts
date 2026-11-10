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

  it('reprennent les entrées de l’application Bubble', () => {
    const total = FAMILLES.reduce((n, f) => n + f.entrees.length, 0);
    // Les 17 de Bubble, moins « Accueil » qui reste seul en tête, moins
    // « Action / Candidat » retiré du menu le 8 août 2026, plus « Nouveau
    // candidat » ajouté à Admin le 8 novembre 2026, plus « Province » ajoutée
    // à Réseau le 10 novembre 2026.
    expect(total).toBe(17);
  });

  it('ne propose plus « Action / Candidat »', () => {
    const libelles = FAMILLES.flatMap((f) => f.entrees.map((e) => e.libelle));
    expect(libelles).not.toContain('Action / Candidat');
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

describe('Nouveau candidat', () => {
  it('est dans Admin, et mène à l’invitation du parrain', () => {
    const admin = FAMILLES.find((f) => f.nom === 'Admin')!;
    expect(admin.entrees).toContainEqual({
      libelle: 'Nouveau candidat',
      vers: '/espace/candidats/nouveau',
    });
  });

  it('s’allume seul sur son écran, « Candidats » s’éteint', () => {
    const visibles = famillesDuRole('admin').flatMap((f) => f.entrees);
    const trouver = (l: string) => visibles.find((e) => e.libelle === l)!;
    const chemin = '/espace/candidats/nouveau';
    expect(estCourante(trouver('Nouveau candidat'), chemin, visibles)).toBe(true);
    expect(estCourante(trouver('Candidats'), chemin, visibles)).toBe(false);
    expect(estCourante(trouver('Candidats'), '/espace/candidats', visibles)).toBe(true);
  });

  it('chez un référent, qui ne la voit pas, « Candidats » reste allumé', () => {
    const visibles = famillesDuRole('referent').flatMap((f) => f.entrees);
    const candidats = visibles.find((e) => e.libelle === 'Candidats')!;
    expect(estCourante(candidats, '/espace/candidats/nouveau', visibles)).toBe(true);
  });
});

describe('Province', () => {
  it('ferme la famille Réseau, sans déplacer les entrées existantes', () => {
    const reseau = FAMILLES.find((f) => f.nom === 'Réseau')!;
    expect(reseau.entrees.map((e) => e.libelle)).toEqual([
      'Référents',
      'Correspondants',
      'Réunion',
      'Province',
    ]);
  });

  it('mène aux cartes des provinces', () => {
    const reseau = FAMILLES.find((f) => f.nom === 'Réseau')!;
    expect(reseau.entrees.find((e) => e.libelle === 'Province')?.vers).toBe('/espace/provinces');
  });

  it('est visible d’un référent comme d’un administrateur — c’est un référentiel', () => {
    for (const role of ['referent', 'admin'] as const) {
      const libelles = famillesDuRole(role).flatMap((f) => f.entrees.map((e) => e.libelle));
      expect(libelles).toContain('Province');
    }
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
