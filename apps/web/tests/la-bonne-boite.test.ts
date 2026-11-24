import { describe, expect, it } from 'vitest';
import { PanneFranceTravail } from '../src/lib/france-travail';
import {
  PORTEE_LA_BONNE_BOITE,
  adresseDeRecherche,
  chercherLesEntreprises,
  departementDuCodePostal,
  divisionsDeLaSection,
  divisionsDuCandidat,
  effectif,
  lireLaReponse,
  serviceLaBonneBoite,
} from '../src/lib/la-bonne-boite';

/** Une entreprise telle que l'API la rend (spécification v2.27.3) — fabriquée. */
function article(siret: string, autres: Record<string, unknown> = {}) {
  return {
    id: 1,
    rome: 'F1703',
    siret,
    company_name: 'Entreprise d’essai',
    office_name: 'Agence d’essai',
    headcount_min: 10,
    headcount_max: 19,
    naf: '43',
    naf_label: 'Travaux de construction spécialisés',
    city: 'Bordeaux',
    postcode: '33000',
    department_number: '33',
    hiring_potential: 87.5,
    is_high_potential: true,
    ...autres,
  };
}

describe('les divisions NAF', () => {
  it('déplie une section en ses divisions', () => {
    expect(divisionsDeLaSection('F')).toEqual(['41', '42', '43']);
    expect(divisionsDeLaSection('a')).toEqual(['01', '02', '03']);
    expect(divisionsDeLaSection('C')).toHaveLength(24);
    expect(divisionsDeLaSection('Z')).toEqual([]);
  });

  it('suit le rang des secteurs, sans doublon', () => {
    expect(
      divisionsDuCandidat([
        { rang: 2, code: 'F', niveau: 'section' },
        { rang: 1, code: '43', niveau: 'division' },
        { rang: 3, code: '86', niveau: 'division' },
      ]),
    ).toEqual(['43', '41', '42', '86']);
  });

  it('ne garde pas plus de quarante divisions', () => {
    const toutes = divisionsDuCandidat([
      { rang: 1, code: 'C', niveau: 'section' },
      { rang: 2, code: 'G', niveau: 'section' },
      { rang: 3, code: 'M', niveau: 'section' },
    ]);
    expect(toutes).toHaveLength(34);
    expect(divisionsDuCandidat([])).toEqual([]);
  });
});

describe('le département du code postal', () => {
  it.each([
    ['33000', '33'],
    ['64 100', '64'],
    ['01000', '01'],
    ['20000', '2A'],
    ['20200', '2B'],
    ['97400', '974'],
  ])('%s → %s', (cp, attendu) => expect(departementDuCodePostal(cp)).toBe(attendu));

  it.each([null, '', '3300', 'abcde', '98000', '97800'])('« %s » n’en désigne aucun', (cp) =>
    expect(departementDuCodePostal(cp)).toBeNull(),
  );
});

describe('la lecture de la réponse', () => {
  it('rend ce que la fiche affiche, et rien d’autre', () => {
    const lu = lireLaReponse({ hits: 42, items: [article('12345678900011')] });
    expect(lu).toEqual({
      total: 42,
      entreprises: [
        {
          siret: '12345678900011',
          nom: 'Agence d’essai',
          ville: 'Bordeaux',
          code_postal: '33000',
          effectif_min: 10,
          effectif_max: 19,
          activite: 'Travaux de construction spécialisés',
          potentiel: 87.5,
          fort_potentiel: true,
        },
      ],
    });
  });

  it('écarte une entreprise illisible, pas la page', () => {
    const lu = lireLaReponse({
      hits: 3,
      items: [
        article('123'),
        article('12345678900029', { office_name: null, headcount_min: 'n/a', is_high_potential: 'oui' }),
        { siret: '12345678900037' },
      ],
    });
    expect(lu.entreprises).toHaveLength(1);
    expect(lu.entreprises[0]).toMatchObject({ nom: 'Entreprise d’essai', effectif_min: null, fort_potentiel: false });
  });

  it('ne casse pas sur une réponse vide ou étrange', () => {
    expect(lireLaReponse(null)).toEqual({ total: 0, entreprises: [] });
    expect(lireLaReponse({ items: 'rien' })).toEqual({ total: 0, entreprises: [] });
  });
});

describe('l’effectif', () => {
  it('se dit en mots', () => {
    expect(effectif(10, 19)).toBe('10 à 19 salariés');
    expect(effectif(250, null)).toBe('250 salariés et plus');
    expect(effectif(null, 9)).toBe('jusqu’à 9 salariés');
    expect(effectif(null, null)).toBeNull();
  });
});

describe('l’adresse de recherche', () => {
  it('répète les divisions et ne porte que divisions et département', () => {
    const a = adresseDeRecherche({ divisions: ['43', '41'], departement: '33' });
    expect(a.origin + a.pathname).toBe('https://api.francetravail.io/partenaire/labonneboite/v2/recherche');
    expect(a.searchParams.getAll('naf')).toEqual(['43', '41']);
    expect(a.searchParams.getAll('department_number')).toEqual(['33']);
    expect(a.searchParams.get('page_size')).toBe('10');
    expect([...new Set(a.searchParams.keys())].sort()).toEqual(
      ['department_number', 'naf', 'page', 'page_size', 'sort_by', 'sort_direction'].sort(),
    );
  });
});

/** Un France Travail de théâtre. */
function theatre(repondre: () => Response) {
  const appels: { adresse: URL; init?: RequestInit }[] = [];
  let heure = Date.UTC(2026, 10, 24, 12);
  const outils = {
    fetch: (async (entree: RequestInfo | URL, init?: RequestInit) => {
      const adresse = new URL(String(entree));
      appels.push({ adresse, init });
      if (adresse.pathname.endsWith('/access_token')) return Response.json({ access_token: 'jeton-essai' });
      return repondre();
    }) as typeof fetch,
    attendre: async () => {},
    maintenant: () => heure,
  };
  return { appels, outils, avancer: (ms: number) => (heure += ms) };
}

const REGLAGES = { clientId: 'identifiant-essai', clientSecret: 'secret-essai', departements: ['33'] };
const RECHERCHE = { divisions: ['43'], departement: '33' };

describe('la recherche', () => {
  it('patiente une fois quand on lui demande de ralentir', async () => {
    let n = 0;
    const t = theatre(() => (n++ === 0 ? new Response(null, { status: 429 }) : Response.json({ hits: 0, items: [] })));
    await expect(chercherLesEntreprises('jeton', RECHERCHE, t.outils)).resolves.toEqual({ total: 0, entreprises: [] });
    expect(n).toBe(2);
  });

  it('dit la panne, avec son statut', async () => {
    const t = theatre(() => new Response(null, { status: 500 }));
    await expect(chercherLesEntreprises('jeton', RECHERCHE, t.outils)).rejects.toMatchObject({
      etape: 'recherche',
      statut: 500,
    });
  });

  it('n’appelle pas France Travail sans division', async () => {
    const t = theatre(() => Response.json({}));
    await chercherLesEntreprises('jeton', { divisions: [], departement: '33' }, t.outils);
    expect(t.appels).toHaveLength(0);
  });
});

describe('le service', () => {
  it('demande la portée de La Bonne Boîte et garde la liste une heure', async () => {
    const t = theatre(() => Response.json({ hits: 1, items: [article('12345678900011')] }));
    const chercher = serviceLaBonneBoite(REGLAGES, t.outils);

    await chercher(RECHERCHE);
    await chercher(RECHERCHE);
    const jetons = t.appels.filter((a) => a.adresse.pathname.endsWith('/access_token'));
    expect(jetons).toHaveLength(1);
    expect(new URLSearchParams(String(jetons[0].init?.body)).get('scope')).toBe(PORTEE_LA_BONNE_BOITE);
    expect(t.appels).toHaveLength(2);

    t.avancer(61 * 60 * 1000);
    await chercher(RECHERCHE);
    // Une heure passée : nouvelle liste, et nouveau jeton (vingt minutes).
    expect(t.appels).toHaveLength(4);
  });

  it('oublie un jeton refusé', async () => {
    let n = 0;
    const t = theatre(() => (n++ === 0 ? new Response(null, { status: 401 }) : Response.json({ items: [] })));
    const chercher = serviceLaBonneBoite(REGLAGES, t.outils);
    await expect(chercher(RECHERCHE)).rejects.toBeInstanceOf(PanneFranceTravail);
    await chercher(RECHERCHE);
    expect(t.appels.filter((a) => a.adresse.pathname.endsWith('/access_token'))).toHaveLength(2);
  });
});
