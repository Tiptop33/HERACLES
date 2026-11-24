import { describe, expect, it } from 'vitest';
import {
  AUCUN_FILTRE,
  DEPARTEMENTS,
  adresseDesOffres,
  basculerDepartement,
  parution,
  sousTitre,
  lienSur,
  lireDetail,
  lireIdentifiantDOffre,
  pointsDuDetail,
  COLONNES_DU_DETAIL,
  type DetailDOffre,
  chercher,
  estFiltre,
  nettoyerRecherche,
  choisirSecteur,
  lirePage,
  nombreDePages,
  tousLesDepartements,
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
    const filtres = { departements: ['2A', '33', '47'], secteur: 'F', recherche: 'chef de chantier', page: 3 };
    const adresse = adresseDesOffres(filtres);
    expect(adresse).toBe('/espace/france-travail?q=chef+de+chantier&dep=2A,33,47&secteur=F&page=3');
    const p = new URL(adresse, 'https://exemple.test').searchParams;
    expect(lireFiltres({
        q: p.get('q') ?? undefined,
        dep: p.get('dep') ?? undefined,
        secteur: p.get('secteur') ?? undefined,
        page: p.get('page') ?? undefined,
      }),
    ).toEqual(filtres);
  });
});

describe('basculerDepartement', () => {
  it('coche, puis décoche, sans toucher au secteur', () => {
    const un = basculerDepartement({ departements: ['47'], secteur: 'F', recherche: 'maçon', page: 1 }, '33');
    expect(un).toEqual({ departements: ['33', '47'], secteur: 'F', recherche: 'maçon', page: 1 });
    expect(basculerDepartement(un, '47')).toEqual({ departements: ['33'], secteur: 'F', recherche: 'maçon', page: 1 });
  });

  it('ramène à la première page, comme tout changement de filtre', () => {
    const page7 = { departements: ['33'], secteur: 'F', recherche: '', page: 7 };
    expect(basculerDepartement(page7, '47').page).toBe(1);
    expect(choisirSecteur(page7, 'C')).toEqual({ departements: ['33'], secteur: 'C', recherche: '', page: 1 });
    expect(chercher(page7, 'maçon')).toEqual({ departements: ['33'], secteur: 'F', recherche: 'maçon', page: 1 });
    expect(tousLesDepartements(page7)).toEqual({ departements: [], secteur: 'F', recherche: '', page: 1 });
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
    const affiches = menusAAfficher(menus, { departements: ['47'], secteur: 'C', recherche: '', page: 1 });
    expect(affiches.departements).toEqual(['33', '47']);
    expect(affiches.secteurs.map((s) => s.code)).toEqual(['C', 'F']);
    expect(menusAAfficher(menus, AUCUN_FILTRE)).toEqual(menus);
  });
});

describe('les pages', () => {
  it('se lisent dans l’adresse — et tout ce qui n’est pas un numéro ouvre la première', () => {
    expect(lireFiltres({ page: '4' }).page).toBe(4);
    expect(lireFiltres({ page: ['2', '9'] }).page).toBe(2);
    for (const faux of ['0', '-1', '2.5', 'deux', '', '1e3', '99999999']) {
      expect(lireFiltres({ page: faux }).page, faux).toBe(1);
    }
  });

  it('la première page ne s’écrit pas dans l’adresse', () => {
    expect(adresseDesOffres({ departements: ['33'], secteur: '', recherche: '', page: 1 })).toBe('/espace/france-travail?dep=33');
    expect(adresseDesOffres({ departements: [], secteur: '', recherche: '', page: 2 })).toBe('/espace/france-travail?page=2');
  });

  it('se comptent à cinquante offres par page', () => {
    expect(nombreDePages(0)).toBe(1);
    expect(nombreDePages(50)).toBe(1);
    expect(nombreDePages(51)).toBe(2);
    expect(nombreDePages(4539)).toBe(91);
  });

  it('une page de la base se lit, ou se refuse', () => {
    const offre = { id: 'a', intitule: 'Essai', entreprise_nom: null, lieu_libelle: null, type_contrat_libelle: null };
    expect(lirePage({ total: 1, offres: [offre] })).toEqual({ total: 1, offres: [offre] });
    // Avec la date de parution (0102), ou sans elle le temps d'une mise en ligne.
    const datee = { ...offre, date_creation: '2026-11-22T08:00:00+00:00' };
    expect(lirePage({ total: 1, offres: [datee] })?.offres[0].date_creation).toBe('2026-11-22T08:00:00+00:00');
    expect(lirePage({ total: 1, offres: [{ ...offre, date_creation: null }] })?.offres[0].date_creation).toBeNull();
    expect(lirePage({ total: -1, offres: [] })).toBeNull();
    expect(lirePage([offre])).toBeNull();
  });
});

describe('la recherche par mots', () => {
  it('se lit dans l’adresse, espaces resserrées', () => {
    expect(lireFiltres({ q: '  chef   de chantier ' }).recherche).toBe('chef de chantier');
    expect(lireFiltres({ q: ['boulanger', 'autre'] }).recherche).toBe('boulanger');
    expect(lireFiltres({}).recherche).toBe('');
    expect(lireFiltres({ q: '   ' }).recherche).toBe('');
  });

  it('est bornée à 120 caractères, sans espace en fin', () => {
    expect(nettoyerRecherche('a'.repeat(300))).toHaveLength(120);
    expect(nettoyerRecherche(`${'a'.repeat(119)} bcd`)).toBe('a'.repeat(119));
  });

  it('garde les accents et les signes : c’est la base qui compare', () => {
    expect(nettoyerRecherche('Électricien 100% & co')).toBe('Électricien 100% & co');
    const adresse = adresseDesOffres({ ...AUCUN_FILTRE, recherche: 'Électricien 100% & co' });
    const p = new URL(adresse, 'https://exemple.test').searchParams;
    expect(lireFiltres({ q: p.get('q') ?? undefined }).recherche).toBe('Électricien 100% & co');
  });

  it('compte comme un filtre — pour dire « aucune offre pour ce choix »', () => {
    expect(estFiltre(AUCUN_FILTRE)).toBe(false);
    expect(estFiltre({ ...AUCUN_FILTRE, page: 4 })).toBe(false);
    expect(estFiltre({ ...AUCUN_FILTRE, recherche: 'maçon' })).toBe(true);
    expect(estFiltre({ ...AUCUN_FILTRE, departements: ['33'] })).toBe(true);
    expect(estFiltre({ ...AUCUN_FILTRE, secteur: 'F' })).toBe(true);
  });

  it('effacer la recherche garde les autres filtres', () => {
    const avec = { departements: ['33'], secteur: 'F', recherche: 'maçon', page: 3 };
    expect(chercher(avec, '  ')).toEqual({ departements: ['33'], secteur: 'F', recherche: '', page: 1 });
  });
});

describe('le détail d’une offre', () => {
  const ID = '0b7e9a52-3c1d-4f6a-9b8e-2d5f7a1c4e90';
  const VIDE = Object.fromEntries(COLONNES_DU_DETAIL.split(', ').map((c) => [c, null])) as unknown as DetailDOffre;
  const offre = (plus: Partial<DetailDOffre>): DetailDOffre => ({ ...VIDE, id: ID, ...plus });

  it('s’ouvre par son identifiant dans l’adresse — et rien d’autre qu’un identifiant', () => {
    expect(lireIdentifiantDOffre(ID)).toBe(ID);
    expect(lireIdentifiantDOffre(ID.toUpperCase())).toBe(ID);
    expect(lireIdentifiantDOffre([ID, 'autre'])).toBe(ID);
    for (const faux of [undefined, '', '12', 'FT0099A', `${ID}'--`, `${ID}/../x`]) {
      expect(lireIdentifiantDOffre(faux), String(faux)).toBeNull();
    }
  });

  it('garde les filtres dans l’adresse quand il s’ouvre, et les rend quand il se ferme', () => {
    const filtres = { departements: ['33'], secteur: 'F', recherche: 'maçon', page: 2 };
    expect(adresseDesOffres(filtres, ID)).toBe(`/espace/france-travail?q=ma%C3%A7on&dep=33&secteur=F&page=2&offre=${ID}`);
    expect(adresseDesOffres(filtres, null)).toBe(adresseDesOffres(filtres));
    expect(adresseDesOffres(AUCUN_FILTRE, ID)).toBe(`/espace/france-travail?offre=${ID}`);
  });

  it('ne demande à la base que les colonnes montrées — pas l’identifiant Bubble, pas « * »', () => {
    expect(COLONNES_DU_DETAIL).toContain('description');
    expect(COLONNES_DU_DETAIL).not.toContain('bubble');
    expect(COLONNES_DU_DETAIL).not.toContain('*');
    expect(COLONNES_DU_DETAIL).not.toContain('texte_cherche');
  });

  it('se lit de la ligne de la base, ou se refuse', () => {
    expect(lireDetail(offre({ intitule: 'Maçon' }))?.intitule).toBe('Maçon');
    expect(lireDetail(null)).toBeNull();
    expect(lireDetail({ id: ID })).toBeNull();
  });

  it('ne montre que les points renseignés, sans redite', () => {
    const points = pointsDuDetail(
      offre({
        lieu_libelle: '47 - AGEN',
        type_contrat_libelle: 'CDI',
        nature_contrat: 'Contrat travail',
        duree_travail_type: 'Temps plein',
        duree_travail_libelle: 'Temps plein',
        salaire_libelle: '   ',
        appellation_libelle: 'Maçon / Maçonne',
        rome_libelle: 'Maçonnerie',
        nombre_postes: 1,
        alternance: false,
        accessible_th: true,
      }),
    );
    expect(points).toEqual([
      { libelle: 'Lieu', valeur: '47 - AGEN' },
      { libelle: 'Contrat', valeur: 'CDI — Contrat travail' },
      { libelle: 'Temps de travail', valeur: 'Temps plein' },
      { libelle: 'Métier', valeur: 'Maçon / Maçonne' },
      { libelle: 'À noter', valeur: 'Accessible aux travailleurs handicapés' },
    ]);
    expect(pointsDuDetail(offre({}))).toEqual([]);
  });

  it('dit le nombre de postes quand il y en a plusieurs', () => {
    expect(pointsDuDetail(offre({ nombre_postes: 3 }))).toEqual([{ libelle: 'Postes', valeur: '3' }]);
  });

  it('ne fait un lien que d’une adresse http ou https', () => {
    expect(lienSur('https://candidat.francetravail.fr/offres/recherche/detail/123ABC')).toBe(
      'https://candidat.francetravail.fr/offres/recherche/detail/123ABC',
    );
    expect(lienSur(' http://exemple.test ')).toBe('http://exemple.test/');
    for (const dangereuse of ['javascript:alert(1)', 'data:text/html,<p>', 'exemple.test', '', null, undefined, 'mailto:a@b.c']) {
      expect(lienSur(dangereuse), String(dangereuse)).toBeNull();
    }
  });
});

describe('la ligne d’une offre dans la liste', () => {
  const offre = { id: 'a', intitule: 'Maçon', entreprise_nom: 'Bâti Essai', lieu_libelle: '47 - AGEN', type_contrat_libelle: 'CDI' };

  it('dit l’entreprise, le lieu et le contrat — sans la date, qui va à droite', () => {
    expect(sousTitre({ ...offre, date_creation: '2026-11-22T08:00:00+00:00' })).toBe('Bâti Essai · 47 - AGEN · CDI');
    expect(sousTitre({ ...offre, entreprise_nom: null })).toBe('47 - AGEN · CDI');
  });

  it('dit à part quand l’annonce est parue', () => {
    expect(parution({ ...offre, date_creation: '2026-11-22T08:00:00+00:00' })).toBe('parue le 22 novembre 2026');
    expect(parution({ ...offre, date_creation: '2026-11-01T08:00:00+00:00' })).toBe('parue le 1er novembre 2026');
  });

  it('ne dit rien de la parution quand France Travail ne l’a pas donnée', () => {
    expect(parution(offre)).toBeNull();
    expect(parution({ ...offre, date_creation: null })).toBeNull();
    expect(parution({ ...offre, date_creation: 'hier' })).toBeNull();
  });
});
