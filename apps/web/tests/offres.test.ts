import { describe, expect, it } from 'vitest';
import {
  AUCUN_FILTRE,
  DEPARTEMENTS,
  adresseDesOffres,
  basculerDepartement,
  lireFiltres,
  lireMenus,
  menusAAfficher,
  nomDuDepartement,
  resumeDesDepartements,
} from '../src/lib/offres';

describe('les départements', () => {
  it('sont les 96 de métropole, Corse en deux, et l’outre-mer', () => {
    expect(Object.keys(DEPARTEMENTS)).toHaveLength(107);
    expect(DEPARTEMENTS['20']).toBeUndefined();
    expect(DEPARTEMENTS['2A']).toBe('Corse-du-Sud');
    expect(DEPARTEMENTS['33']).toBe('Gironde');
  });

  it('se nomment avec leur numéro — et un numéro inconnu s’affiche seul', () => {
    expect(nomDuDepartement('47')).toBe('47 — Lot-et-Garonne');
    expect(nomDuDepartement('99')).toBe('99');
  });
});

describe('lireFiltres', () => {
  it('sans rien dans l’adresse : aucun filtre', () => {
    expect(lireFiltres({})).toEqual(AUCUN_FILTRE);
  });

  it('lit plusieurs départements, séparés par des virgules ou répétés', () => {
    expect(lireFiltres({ dep: '47,33' }).departements).toEqual(['33', '47']);
    expect(lireFiltres({ dep: ['47', '33,24'] }).departements).toEqual(['24', '33', '47']);
  });

  it('range la Corse entre 19 et 21, l’outre-mer à la fin, sans doublon', () => {
    expect(lireFiltres({ dep: '971,21,2b,19,2A,2a' }).departements).toEqual(['19', '2A', '2B', '21', '971']);
  });

  it('ignore ce qui n’est pas un numéro, sans erreur', () => {
    expect(lireFiltres({ dep: 'Gironde,3,33;drop,,47' }).departements).toEqual(['47']);
  });

  it('ne garde du secteur qu’une lettre de A à U', () => {
    expect(lireFiltres({ secteur: 'f' }).secteur).toBe('F');
    expect(lireFiltres({ secteur: ['C', 'F'] }).secteur).toBe('C');
    expect(lireFiltres({ secteur: 'Z' }).secteur).toBe('');
    expect(lireFiltres({ secteur: '43' }).secteur).toBe('');
  });
});

describe('adresseDesOffres', () => {
  it('sans filtre : l’adresse nue', () => {
    expect(adresseDesOffres(AUCUN_FILTRE)).toBe('/espace/france-travail');
  });

  it('écrit ce que lireFiltres relit', () => {
    const filtres = { departements: ['2A', '33', '47'], secteur: 'F' };
    const adresse = adresseDesOffres(filtres);
    expect(adresse).toBe('/espace/france-travail?dep=2A,33,47&secteur=F');
    const p = new URL(adresse, 'https://exemple.test').searchParams;
    expect(lireFiltres({ dep: p.get('dep') ?? undefined, secteur: p.get('secteur') ?? undefined })).toEqual(filtres);
  });
});

describe('basculerDepartement', () => {
  it('coche, puis décoche, sans toucher au secteur', () => {
    const un = basculerDepartement({ departements: ['47'], secteur: 'F' }, '33');
    expect(un).toEqual({ departements: ['33', '47'], secteur: 'F' });
    expect(basculerDepartement(un, '47')).toEqual({ departements: ['33'], secteur: 'F' });
  });
});

describe('resumeDesDepartements', () => {
  it('dit tous, le seul choisi, ou combien', () => {
    expect(resumeDesDepartements([])).toBe('Tous les départements');
    expect(resumeDesDepartements(['33'])).toBe('33 — Gironde');
    expect(resumeDesDepartements(['33', '47', '24'])).toBe('3 départements');
  });
});

describe('les menus', () => {
  it('se lisent de la réponse de la base', () => {
    expect(lireMenus({ departements: ['47', '2A', '33'], secteurs: [['F', 'Construction']] })).toEqual({
      departements: ['2A', '33', '47'],
      secteurs: [{ code: 'F', intitule: 'Construction' }],
    });
  });

  it('refusent une réponse qui n’a pas la forme attendue', () => {
    expect(lireMenus(null)).toBeNull();
    expect(lireMenus({ departements: [33], secteurs: [] })).toBeNull();
  });

  it('gardent ce qui est choisi, même si plus aucune offre ne le porte — pour pouvoir le décocher', () => {
    const menus = { departements: ['33'], secteurs: [{ code: 'F', intitule: 'Construction' }] };
    const affiches = menusAAfficher(menus, { departements: ['47'], secteur: 'C' });
    expect(affiches.departements).toEqual(['33', '47']);
    expect(affiches.secteurs.map((s) => s.code)).toEqual(['C', 'F']);
    expect(menusAAfficher(menus, AUCUN_FILTRE)).toEqual(menus);
  });
});
