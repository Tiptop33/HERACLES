import { describe, expect, it } from 'vitest';
import {
  PORTEE_ROMEO,
  adresseDeRecherche,
  codePostalValide,
  estEnAlternance,
  lireLaPosition,
  lireLesOffres,
  lireLesRomes,
  lireReglagesAlternance,
  metierAPredire,
  serviceLaBonneAlternance,
} from '../src/lib/la-bonne-alternance';

/** Une offre telle que l'API la rend — fabriquée. */
function offre(id: string, autres: Record<string, unknown> = {}) {
  return {
    identifier: { id, partner_job_id: `p-${id}`, partner_label: 'La bonne alternance' },
    workplace: {
      name: 'Atelier d’essai',
      brand: null,
      legal_name: 'ATELIER ESSAI SARL',
      siret: '12345678900011',
      location: { address: '1 rue de l’Essai 33000 Bordeaux', geopoint: { type: 'Point', coordinates: [-0.57, 44.84] } },
      domain: { idcc: null, opco: null, naf: { code: '4321A', label: 'Travaux d’installation électrique' } },
    },
    apply: { url: `https://labonnealternance.example/offre/${id}`, phone: '0600000000', recipient_id: null },
    contract: { start: '2027-09-01T00:00:00.000Z', duration: 24, type: ['Apprentissage'], remote: null },
    offer: { title: 'Électricien en alternance', description: '…', rome_codes: ['F1602'], status: 'Active' },
    ...autres,
  };
}

/** Une commune telle que la route géographie la rend — fabriquée. */
function commune(nom: string, longitude: number, latitude: number) {
  return { nom, code: { insee: '33000', postaux: ['33000'] }, localisation: { centre: { type: 'Point', coordinates: [longitude, latitude] } } };
}

describe('qui est concerné', () => {
  it('reconnaît l’alternance', () => {
    expect(estEnAlternance('stage en alternance')).toBe(true);
    expect(estEnAlternance('Alternance')).toBe(true);
    expect(estEnAlternance('stage')).toBe(false);
    expect(estEnAlternance(null)).toBe(false);
  });

  it('prend le premier métier lisible, court et sur une ligne', () => {
    expect(metierAPredire(null, '  Électricien\n bâtiment ')).toBe('Électricien bâtiment');
    expect(metierAPredire('x', 'Cuisinier')).toBe('Cuisinier');
    expect(metierAPredire('a'.repeat(300))).toHaveLength(120);
    expect(metierAPredire('', null)).toBeNull();
  });

  it('veut un code postal à cinq chiffres', () => {
    expect(codePostalValide('33 000')).toBe('33000');
    expect(codePostalValide('3300')).toBeNull();
    expect(codePostalValide(null)).toBeNull();
  });

  it('demande la clé et les identifiants France Travail', () => {
    expect(lireReglagesAlternance({ FRANCE_TRAVAIL_CLIENT_ID: 'a', FRANCE_TRAVAIL_CLIENT_SECRET: 'b' })).toBeNull();
    expect(
      lireReglagesAlternance({ FRANCE_TRAVAIL_CLIENT_ID: 'a', FRANCE_TRAVAIL_CLIENT_SECRET: 'b', LA_BONNE_ALTERNANCE_CLE: ' c ' }),
    ).toEqual({ clientId: 'a', clientSecret: 'b', cle: 'c' });
  });
});

describe('ROMEO', () => {
  it('garde le premier code, puis les suivants assez sûrs, sans doublon', () => {
    const lu = lireLesRomes([
      {
        metiersRome: [
          { codeRome: 'F1602', scorePrediction: 0.4 },
          { codeRome: 'F1602', scorePrediction: 0.9 },
          { codeRome: 'h2602', scorePrediction: 0.6 },
          { codeRome: 'I1309', scorePrediction: 0.2 },
          { codeRome: 'n’importe quoi', scorePrediction: 0.99 },
        ],
      },
    ]);
    expect(lu).toEqual(['F1602', 'H2602']);
  });

  it('ne casse pas sur une réponse vide ou étrange', () => {
    expect(lireLesRomes(null)).toEqual([]);
    expect(lireLesRomes([])).toEqual([]);
    expect(lireLesRomes([{ metiersRome: 'rien' }])).toEqual([]);
  });
});

describe('la commune', () => {
  it('choisit la commune de la fiche, longitude d’abord', () => {
    const json = [commune('Bordeaux', -0.58, 44.84), commune('Saint-Médard-en-Jalles', -0.72, 44.9)];
    expect(lireLaPosition(json, 'ST MEDARD EN JALLES')).toEqual({ latitude: 44.9, longitude: -0.72 });
    expect(lireLaPosition(json, 'Ailleurs')).toEqual({ latitude: 44.84, longitude: -0.58 });
    expect(lireLaPosition(json, null)).toEqual({ latitude: 44.84, longitude: -0.58 });
  });

  it('rend null sans commune ou avec des coordonnées absurdes', () => {
    expect(lireLaPosition([], 'Bordeaux')).toBeNull();
    expect(lireLaPosition([commune('X', 10, 200)], null)).toBeNull();
    expect(lireLaPosition({ erreur: true }, null)).toBeNull();
  });
});

describe('les offres', () => {
  it('rend ce que la fiche affiche, sans le téléphone du recruteur', () => {
    const lu = lireLesOffres({ jobs: [offre('a1')], recruiters: [] });
    expect(lu).toEqual({
      total: 1,
      offres: [
        {
          id: 'a1',
          titre: 'Électricien en alternance',
          entreprise: 'Atelier d’essai',
          adresse: '1 rue de l’Essai 33000 Bordeaux',
          contrats: ['Apprentissage'],
          debut: '2027-09-01T00:00:00.000Z',
          duree_mois: 24,
          lien: 'https://labonnealternance.example/offre/a1',
        },
      ],
    });
    expect(JSON.stringify(lu)).not.toContain('0600000000');
  });

  it('écarte une offre illisible ou en double, et un lien qui n’est pas une page web', () => {
    const lu = lireLesOffres({
      jobs: [
        offre('a1'),
        offre('a1'),
        { identifier: { id: 'sans-titre' }, offer: {} },
        offre('a2', { apply: { url: 'javascript:alert(1)' }, contract: null, workplace: null }),
      ],
    });
    expect(lu.offres.map((o) => o.id)).toEqual(['a1', 'a2']);
    expect(lu.offres[1]).toMatchObject({ lien: null, entreprise: null, contrats: [], debut: null });
  });

  it('n’en montre que dix, et dit combien il y en avait', () => {
    const lu = lireLesOffres({ jobs: Array.from({ length: 14 }, (_, i) => offre(`o${i}`)) });
    expect(lu.total).toBe(14);
    expect(lu.offres).toHaveLength(10);
  });

  it('cherche par codes ROME autour du centre de la commune', () => {
    const a = adresseDeRecherche({ romes: ['F1602', 'H2602'], position: { latitude: 44.837789, longitude: -0.57918 } });
    expect(a.origin + a.pathname).toBe('https://api.apprentissage.beta.gouv.fr/api/job/v1/search');
    expect(Object.fromEntries(a.searchParams)).toEqual({
      romes: 'F1602,H2602',
      latitude: '44.8378',
      longitude: '-0.5792',
      radius: '30',
    });
  });
});

/** ROMEO, la géographie et La bonne alternance, de théâtre. */
function theatre(offres: () => Response = () => Response.json({ jobs: [offre('a1')] })) {
  const appels: { adresse: URL; init?: RequestInit }[] = [];
  let heure = Date.UTC(2026, 10, 24, 12);
  const outils = {
    fetch: (async (entree: RequestInfo | URL, init?: RequestInit) => {
      const adresse = new URL(String(entree));
      appels.push({ adresse, init });
      if (adresse.pathname.endsWith('/access_token')) return Response.json({ access_token: 'jeton-essai' });
      if (adresse.pathname.endsWith('/predictionMetiers')) {
        return Response.json([{ metiersRome: [{ codeRome: 'F1602', scorePrediction: 0.8 }] }]);
      }
      if (adresse.pathname.endsWith('/commune/search')) return Response.json([commune('Bordeaux', -0.58, 44.84)]);
      return offres();
    }) as typeof fetch,
    attendre: async () => {},
    maintenant: () => heure,
  };
  return { appels, outils, avancer: (ms: number) => (heure += ms) };
}

const REGLAGES = { clientId: 'identifiant-essai', clientSecret: 'secret-essai', cle: 'cle-essai' };
const DEMANDE = { metier: 'Électricien', codePostal: '33000', ville: 'Bordeaux' };

describe('le service', () => {
  it('enchaîne ROMEO, la commune et la recherche, et ne refait rien dans l’heure', async () => {
    const t = theatre();
    const chercher = serviceLaBonneAlternance(REGLAGES, t.outils);

    const reponse = await chercher(DEMANDE);
    expect(reponse).toMatchObject({ etat: 'ok', romes: ['F1602'], resultat: { total: 1 } });

    const jeton = t.appels.find((a) => a.adresse.pathname.endsWith('/access_token'));
    expect(new URLSearchParams(String(jeton?.init?.body)).get('scope')).toBe(PORTEE_ROMEO);
    const romeo = t.appels.find((a) => a.adresse.pathname.endsWith('/predictionMetiers'));
    expect(JSON.parse(String(romeo?.init?.body))).toEqual({
      appellations: [{ intitule: 'Électricien', identifiant: '1' }],
      options: { nomAppelant: 'heracles', nbResultats: 3 },
    });
    const recherche = t.appels.find((a) => a.adresse.pathname.endsWith('/job/v1/search'));
    expect((recherche?.init?.headers as Record<string, string>).Authorization).toBe('Bearer cle-essai');

    const avant = t.appels.length;
    await chercher(DEMANDE);
    expect(t.appels.length).toBe(avant);

    // Une heure plus tard : seule la liste est redemandée.
    t.avancer(61 * 60 * 1000);
    await chercher(DEMANDE);
    expect(t.appels.slice(avant).map((a) => a.adresse.pathname)).toEqual(['/api/job/v1/search']);
  });

  it('dit quand le métier n’est pas reconnu', async () => {
    const t = theatre();
    const fetchDOrigine = t.outils.fetch;
    t.outils.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) =>
      String(entree).includes('predictionMetiers') ? Response.json([{ metiersRome: [] }]) : fetchDOrigine(entree, init)) as typeof fetch;
    const chercher = serviceLaBonneAlternance(REGLAGES, t.outils);
    await expect(chercher(DEMANDE)).resolves.toEqual({ etat: 'metier-inconnu' });
  });

  it('dit la panne de La bonne alternance, avec son statut', async () => {
    const t = theatre(() => new Response(null, { status: 500 }));
    const chercher = serviceLaBonneAlternance(REGLAGES, t.outils);
    await expect(chercher(DEMANDE)).rejects.toMatchObject({ statut: 500 });
  });
});
