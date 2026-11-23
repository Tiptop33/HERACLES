import { describe, expect, it } from 'vitest';
import {
  DEPARTEMENTS_PAR_DEFAUT,
  PanneFranceTravail,
  dateDeLApi,
  fenetres,
  joursARemonter,
  lireReglages,
  obtenirJeton,
  recevoirLesOffres,
  totalAnnonce,
  type Compte,
  type Outils,
  type Reglages,
} from '../src/lib/france-travail';

const REGLAGES: Reglages = { clientId: 'identifiant-essai', clientSecret: 'secret-essai', departements: ['33'] };
/** Le 23 novembre 2026 à midi, UTC. */
const MIDI = Date.UTC(2026, 10, 23, 12, 0, 0);

type Appel = { adresse: URL; init?: RequestInit };

/** Un France Travail de théâtre : on lui dit quoi répondre à chaque recherche. */
function theatre(repondre: (adresse: URL, rang: number) => Response) {
  const appels: Appel[] = [];
  const deposees: unknown[][] = [];
  const attentes: number[] = [];
  let heure = MIDI;
  const outils: Outils = {
    fetch: (async (entree: RequestInfo | URL, init?: RequestInit) => {
      const adresse = new URL(String(entree));
      appels.push({ adresse, init });
      if (adresse.pathname.endsWith('/access_token')) {
        return Response.json({ access_token: 'jeton-essai', expires_in: 1499 });
      }
      const rang = Number((adresse.searchParams.get('range') ?? '0').split('-')[0]);
      return repondre(adresse, rang);
    }) as typeof fetch,
    maintenant: () => heure,
    attendre: async (ms) => {
      attentes.push(ms);
      heure += ms;
    },
    deposer: async (offres): Promise<Compte> => {
      deposees.push(offres);
      return { recues: offres.length, creees: offres.length, mises_a_jour: 0 };
    },
  };
  return { outils, appels, deposees, attentes, avancer: (ms: number) => (heure += ms) };
}

const offres = (n: number, depuis = 0) => Array.from({ length: n }, (_, i) => ({ id: `FT${depuis + i}` }));
const page = (liste: unknown[], total: number, statut = 206) =>
  new Response(JSON.stringify({ resultats: liste }), {
    status: statut,
    headers: { 'content-range': `offres 0-${liste.length - 1}/${total}` },
  });

describe('lireReglages', () => {
  it('sans identifiants : la réception n’est pas configurée', () => {
    expect(lireReglages({})).toBeNull();
    expect(lireReglages({ FRANCE_TRAVAIL_CLIENT_ID: 'x' })).toBeNull();
    expect(lireReglages({ FRANCE_TRAVAIL_CLIENT_ID: ' ', FRANCE_TRAVAIL_CLIENT_SECRET: 'y' })).toBeNull();
  });

  it('reprend par défaut les quatre départements de l’application Bubble', () => {
    const lus = lireReglages({ FRANCE_TRAVAIL_CLIENT_ID: 'x', FRANCE_TRAVAIL_CLIENT_SECRET: 'y' });
    expect(lus?.departements).toEqual(DEPARTEMENTS_PAR_DEFAUT);
    expect(DEPARTEMENTS_PAR_DEFAUT).toEqual(['33', '40', '47', '64']);
  });

  it('lit une liste de départements, sans doublon ni valeur fantaisiste', () => {
    const lus = lireReglages({
      FRANCE_TRAVAIL_CLIENT_ID: 'x',
      FRANCE_TRAVAIL_CLIENT_SECRET: 'y',
      FRANCE_TRAVAIL_DEPARTEMENTS: ' 24, 33 ,2a,Gironde,33,,971',
    });
    expect(lus?.departements).toEqual(['24', '33', '2A', '971']);
  });
});

describe('les petites pièces', () => {
  it('écrit les dates comme l’API les attend, sans millisecondes', () => {
    expect(dateDeLApi(new Date(MIDI))).toBe('2026-11-23T12:00:00Z');
  });

  it('lit le total de l’en-tête Content-Range', () => {
    expect(totalAnnonce('offres 0-149/1234')).toBe(1234);
    expect(totalAnnonce('offres */0')).toBe(0);
    expect(totalAnnonce(null)).toBeNull();
    expect(totalAnnonce('n’importe quoi')).toBeNull();
  });

  it('découpe jour par jour, le plus récent d’abord, sans recouvrement', () => {
    const f = fenetres(['33', '47'], 2, MIDI);
    expect(f.map((x) => [x.departement, dateDeLApi(x.debut), dateDeLApi(x.fin)])).toEqual([
      ['33', '2026-11-23T00:00:00Z', '2026-11-23T12:00:00Z'],
      ['47', '2026-11-23T00:00:00Z', '2026-11-23T12:00:00Z'],
      ['33', '2026-11-22T00:00:00Z', '2026-11-22T23:59:59Z'],
      ['47', '2026-11-22T00:00:00Z', '2026-11-22T23:59:59Z'],
    ]);
  });

  it('remonte depuis la dernière offre connue, entre deux et trente et un jours', () => {
    const jour = 24 * 3600 * 1000;
    expect(joursARemonter(null, MIDI)).toBe(31);
    expect(joursARemonter(new Date(MIDI - 3600 * 1000), MIDI)).toBe(2);
    expect(joursARemonter(new Date(MIDI - 5 * jour), MIDI)).toBe(6);
    expect(joursARemonter(new Date(Date.UTC(2026, 4, 25)), MIDI)).toBe(31);
  });
});

describe('obtenirJeton', () => {
  it('présente les identifiants en formulaire, avec la portée de l’API des offres', async () => {
    const { outils, appels } = theatre(() => new Response(null, { status: 204 }));
    expect(await obtenirJeton(REGLAGES, outils)).toBe('jeton-essai');
    const corps = appels[0].init?.body as URLSearchParams;
    expect(appels[0].adresse.searchParams.get('realm')).toBe('/partenaire');
    expect(appels[0].init?.method).toBe('POST');
    expect(corps.get('grant_type')).toBe('client_credentials');
    expect(corps.get('client_id')).toBe('identifiant-essai');
    expect(corps.get('scope')).toBe('api_offresdemploiv2 o2dsoffre');
  });

  it('dit que les identifiants sont refusés — sans les répéter', async () => {
    const outils = { fetch: (async () => new Response('non', { status: 401 })) as typeof fetch };
    const panne = await obtenirJeton(REGLAGES, outils).catch((e) => e);
    expect(panne).toBeInstanceOf(PanneFranceTravail);
    expect(panne.etape).toBe('jeton');
    expect(panne.statut).toBe(401);
    expect(panne.message).not.toContain('secret-essai');
  });
});

describe('recevoirLesOffres', () => {
  it('une journée sans offre : rien à déposer, et c’est fini', async () => {
    const t = theatre(() => new Response(null, { status: 204 }));
    const bilan = await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils);
    expect(bilan).toMatchObject({ recues: 0, appels: 1, fenetres_lues: 1, fenetres_prevues: 1, termine: true });
    expect(t.deposees).toEqual([]);
  });

  it('cherche par département et par jour, le jeton en en-tête', async () => {
    const t = theatre(() => page(offres(3), 3, 200));
    await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils);
    const recherche = t.appels[1];
    expect(recherche.adresse.pathname).toBe('/partenaire/offresdemploi/v2/offres/search');
    expect(recherche.adresse.searchParams.get('departement')).toBe('33');
    expect(recherche.adresse.searchParams.get('minCreationDate')).toBe('2026-11-23T00:00:00Z');
    expect(recherche.adresse.searchParams.get('maxCreationDate')).toBe('2026-11-23T12:00:00Z');
    expect(recherche.adresse.searchParams.get('range')).toBe('0-149');
    expect((recherche.init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton-essai');
  });

  it('suit les pages jusqu’au total annoncé, et dépose chacune', async () => {
    const t = theatre((_, rang) => (rang === 0 ? page(offres(150), 380) : rang === 150 ? page(offres(150, 150), 380) : page(offres(80, 300), 380)));
    const bilan = await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils);
    expect(bilan).toMatchObject({ recues: 380, creees: 380, appels: 3, plafonnees: 0, termine: true });
    expect(t.deposees.map((p) => p.length)).toEqual([150, 150, 80]);
    expect(t.appels.slice(1).map((a) => a.adresse.searchParams.get('range'))).toEqual(['0-149', '150-299', '300-449']);
  });

  it('s’arrête pile au total quand la dernière page est pleine', async () => {
    const t = theatre((_, rang) => page(offres(150, rang), 300));
    const bilan = await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils);
    expect(bilan.appels).toBe(2);
    expect(bilan.recues).toBe(300);
  });

  it('ne demande jamais au-delà du dernier rang que l’API accepte, et le signale', async () => {
    const t = theatre((_, rang) => page(offres(150, rang), 9000));
    const bilan = await recevoirLesOffres(REGLAGES, 1, 3_600_000, t.outils);
    expect(bilan.appels).toBe(21);
    expect(bilan.recues).toBe(3150);
    expect(bilan.plafonnees).toBe(1);
    expect(t.appels.at(-1)?.adresse.searchParams.get('range')).toBe('3000-3149');
  });

  it('patiente quand France Travail demande de ralentir, puis reprend', async () => {
    let refus = 2;
    const t = theatre(() => {
      if (refus > 0) {
        refus -= 1;
        return new Response(null, { status: 429, headers: { 'retry-after': '2' } });
      }
      return page(offres(5), 5, 200);
    });
    const bilan = await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils);
    expect(bilan.recues).toBe(5);
    expect(t.attentes).toEqual([2000, 2000]);
  });

  it('s’arrête proprement quand le temps imparti est écoulé — ce qui est déposé reste', async () => {
    const t = theatre(() => {
      t.avancer(40_000);
      return page(offres(10), 10, 200);
    });
    const bilan = await recevoirLesOffres({ ...REGLAGES, departements: ['33', '47'] }, 3, 100_000, t.outils);
    expect(bilan.termine).toBe(false);
    expect(bilan.fenetres_prevues).toBe(6);
    expect(bilan.fenetres_lues).toBe(3);
    expect(bilan.recues).toBe(30);
  });

  it('reprend où l’appel précédent s’est arrêté, sans refaire le début', async () => {
    const t = theatre(() => page(offres(10), 10, 200));
    const reglages = { ...REGLAGES, departements: ['33', '47'] };
    const bilan = await recevoirLesOffres(reglages, 3, 100_000, t.outils, 3);
    expect(bilan).toMatchObject({ termine: true, fenetres_lues: 6, fenetres_prevues: 6, appels: 3, recues: 30 });
    // Les trois premières fenêtres — le 23 dans les deux départements, le 22 en Gironde — sont sautées.
    expect(t.appels.slice(1).map((a) => [a.adresse.searchParams.get('departement'), a.adresse.searchParams.get('minCreationDate')])).toEqual([
      ['47', '2026-11-22T00:00:00Z'],
      ['33', '2026-11-21T00:00:00Z'],
      ['47', '2026-11-21T00:00:00Z'],
    ]);
  });

  it('une reprise au-delà de la fin n’interroge rien, et dit que c’est fini', async () => {
    const t = theatre(() => page(offres(10), 10, 200));
    const bilan = await recevoirLesOffres(REGLAGES, 2, 100_000, t.outils, 99);
    expect(bilan).toMatchObject({ termine: true, fenetres_lues: 2, appels: 0, recues: 0 });
  });

  it('une erreur de France Travail arrête la réception, avec l’étape et le code', async () => {
    const t = theatre(() => new Response('panne', { status: 500 }));
    const panne = await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils).catch((e) => e);
    expect(panne).toBeInstanceOf(PanneFranceTravail);
    expect(panne.etape).toBe('recherche');
    expect(panne.statut).toBe(500);
  });

  it('un dépôt refusé par la base arrête la réception, sans rien dire de l’offre', async () => {
    const t = theatre(() => page([{ id: 'FT1', intitule: 'Intitulé à ne pas journaliser' }], 1, 200));
    t.outils.deposer = async () => {
      throw new Error('42501');
    };
    const panne = await recevoirLesOffres(REGLAGES, 1, 60_000, t.outils).catch((e) => e);
    expect(panne).toBeInstanceOf(PanneFranceTravail);
    expect(panne.etape).toBe('depot');
    expect(panne.message).not.toContain('Intitulé');
  });
});
