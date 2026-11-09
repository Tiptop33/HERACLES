import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PDFDocument } from 'pdf-lib';
import {
  LectureDuCv,
  casesARemplir,
  demandeDeLecture,
  estLisible,
  nettoyerLecture,
  type LectureDuCv as Lecture,
} from '../src/lib/lecture-cv';

// Le SDK est remplacé par un double : aucun test n'appelle l'API, ni ne paie.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class Double extends reel.default {
    constructor(options?: ConstructorParameters<typeof reel.default>[0]) {
      super({ ...options, apiKey: 'cle-de-test' });
      Object.assign(this, { beta: { messages: { parse } } });
    }
  }
  return { ...reel, default: Double };
});

const { blocDuCv, lireLeCv } = await import('../src/lib/lecture-cv-serveur');

/** Une lecture où rien n'a été trouvé — des chaînes vides —, à compléter case par case. */
const vide: Lecture = {
  prenom: '',
  nom: '',
  email: '',
  telephone: '',
  age: '',
  situation_familiale: '',
  adresse: '',
  code_postal: '',
  ville: '',
  type_emploi: '',
  emploi_recherche: '',
  definition_emploi: '',
  mobilite_geographique: '',
  permis_vl: '',
  permis_moto: '',
  permis_pl: '',
  vehicule: '',
  formations: '',
  experiences: '',
  competences: '',
  informatique: '',
  savoir_etre: '',
  centres_interet: '',
  photo: 'non',
};

describe('ce que l’on demande au modèle', () => {
  it('envoie un schéma sans union : l’API en refuse plus de seize', () => {
    // Le 9 novembre 2026, 23 cases « texte ou null » faisaient échouer toute
    // lecture : « Schemas contains too many parameters with union types ».
    const schema = JSON.stringify(betaZodOutputFormat(LectureDuCv));
    const unions = (schema.match(/"anyOf"|"oneOf"|"type":\[/g) ?? []).length;
    expect(unions).toBe(0);
  });

  it('accepte une réponse dont une liste fermée sort de ses valeurs : le tri se fait après', () => {
    // Sinon, une seule valeur hors liste ferait perdre toute la lecture.
    expect(LectureDuCv.safeParse({ ...vide, mobilite_geographique: 'Nationale' }).success).toBe(true);
  });

  it('dit au modèle les valeurs permises de chaque liste', () => {
    expect(LectureDuCv.shape.situation_familiale.description).toContain('« Marié »');
    expect(LectureDuCv.shape.situation_familiale.description).not.toContain('le fils');
  });

  it('donne la date du jour, pour calculer un âge', () => {
    expect(demandeDeLecture(new Date('2026-11-09T10:00:00Z'))).toContain('2026-11-09');
  });

  it('lit le PDF, le Word et les photos, pas les autres formats', () => {
    expect(['pdf', 'docx', 'jpg', 'png', 'webp'].every((f) => estLisible(f as never))).toBe(true);
    expect(['doc', 'odt', 'rtf'].some((f) => estLisible(f as never))).toBe(false);
  });
});

describe('ce que l’on garde de la lecture', () => {
  it('ne rend que les cases trouvées, sans blancs', () => {
    expect(nettoyerLecture({ ...vide, ville: '  Lyon ', adresse: '   ' })).toEqual({ ville: 'Lyon' });
  });

  it('écarte une adresse e-mail mal formée, et met la bonne en minuscules', () => {
    expect(nettoyerLecture({ ...vide, email: 'pas une adresse' })).toEqual({});
    expect(nettoyerLecture({ ...vide, email: 'Lea.Petit@Example.org' })).toEqual({
      email: 'lea.petit@example.org',
    });
  });

  it('ne garde qu’un âge entier de 14 à 99 ans', () => {
    expect(nettoyerLecture({ ...vide, age: '31' })).toEqual({ age: '31' });
    expect(nettoyerLecture({ ...vide, age: ' 31 ' })).toEqual({ age: '31' });
    expect(nettoyerLecture({ ...vide, age: '12' })).toEqual({});
    expect(nettoyerLecture({ ...vide, age: '31,5' })).toEqual({});
    expect(nettoyerLecture({ ...vide, age: '31 ans' })).toEqual({});
  });

  it('ne garde des listes fermées que les valeurs du formulaire', () => {
    expect(
      nettoyerLecture({
        ...vide,
        situation_familiale: 'Marié',
        mobilite_geographique: 'Nationale',
        type_emploi: 'CDI',
        permis_vl: 'Oui',
        permis_pl: 'Peut-être',
      }),
    ).toEqual({ situation_familiale: 'Marié', permis_vl: 'Oui' });
  });

  it('ne propose jamais un lien avec le parrain comme situation familiale', () => {
    expect(nettoyerLecture({ ...vide, situation_familiale: 'le fils' })).toEqual({});
  });

  it('écarte un code postal illisible', () => {
    expect(nettoyerLecture({ ...vide, code_postal: '69003' })).toEqual({ code_postal: '69003' });
    expect(nettoyerLecture({ ...vide, code_postal: 'Lyon 3e arrondissement' })).toEqual({});
  });

  it('coupe un texte trop long à la longueur que le formulaire accepte', () => {
    const lu = nettoyerLecture({ ...vide, emploi_recherche: 'x'.repeat(500) });
    expect(lu.emploi_recherche).toHaveLength(200);
  });
});

describe('les cases que l’on remplit', () => {
  it('ne remplit que les cases vides, et n’écrase jamais une saisie', () => {
    const actuelles = { prenom: 'Léa', telephone: '', ville: '  ' };
    const extrait = { prenom: 'Lea', telephone: '06 12 34 56 78', ville: 'Lyon' };
    expect(casesARemplir(actuelles, extrait)).toEqual({
      telephone: '06 12 34 56 78',
      ville: 'Lyon',
    });
  });

  it('ignore une case que le formulaire n’a pas', () => {
    expect(casesARemplir({}, { ville: 'Lyon' })).toEqual({});
  });
});

describe('la lecture par Claude', () => {
  beforeEach(() => {
    parse.mockReset();
    vi.stubEnv('ANTHROPIC_API_KEY', 'cle-de-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const pdf = new TextEncoder().encode('%PDF-1.7 CV fabriqué pour le test');

  it('ne part pas sans clé, et le dit', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await lireLeCv(pdf, 'pdf')).toEqual({ ok: false, raison: 'indisponible' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('envoie le PDF en document, la photo en image', async () => {
    expect(await blocDuCv(pdf, 'pdf')).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    });
    expect(await blocDuCv(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'png')).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' },
    });
  });

  it('rend ce qu’il a lu, nettoyé', async () => {
    parse.mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: { ...vide, telephone: '06 12 34 56 78', age: '31', ville: ' Lyon ' },
    });

    expect(await lireLeCv(pdf, 'pdf', new Date('2026-11-09T10:00:00Z'))).toEqual({
      ok: true,
      extrait: { telephone: '06 12 34 56 78', age: '31', ville: 'Lyon' },
      photo: null,
    });

    const demande = parse.mock.calls[0][0];
    expect(demande.model).toBe('claude-opus-5-5');
    expect(demande.output_config.effort).toBe('low');
    expect(demande.fallbacks).toBe('default');
    expect(demande.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(demande.messages[0].content[0].type).toBe('document');
    expect(demande.messages[0].content[1].text).toContain('2026-11-09');
  });

  it('sort la photo du CV quand le modèle y voit un portrait — et seulement alors', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage([595, 842]);
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x01, 0x2c,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]); // 300 × 400
    page.drawImage(await document.embedJpg(jpeg), { x: 40, y: 600, width: 100, height: 130 });
    const cvAvecPhoto = await document.save();

    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { ...vide, photo: 'oui' } });
    const avec = await lireLeCv(cvAvecPhoto, 'pdf');
    expect(avec.ok && avec.photo).toEqual({
      type: 'image/jpeg',
      base64: Buffer.from(jpeg).toString('base64'),
    });

    // Le modèle n'y voit pas de portrait : l'image reste dans le CV.
    parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { ...vide, photo: 'non' } });
    const sans = await lireLeCv(cvAvecPhoto, 'pdf');
    expect(sans.ok && sans.photo).toBeNull();
  });

  it('rend un échec, sans lever, quand la lecture est refusée', async () => {
    parse.mockResolvedValue({ stop_reason: 'refusal', stop_details: null, parsed_output: null });
    expect(await lireLeCv(pdf, 'pdf')).toEqual({ ok: false, raison: 'echec' });
  });

  it('rend « illisible » quand la réponse est tronquée', async () => {
    parse.mockResolvedValue({ stop_reason: 'max_tokens', parsed_output: null });
    expect(await lireLeCv(pdf, 'pdf')).toEqual({ ok: false, raison: 'illisible' });
  });

  it('rend un échec, sans lever, quand l’API ne répond pas', async () => {
    parse.mockRejectedValue(new Error('réseau coupé'));
    expect(await lireLeCv(pdf, 'pdf')).toEqual({ ok: false, raison: 'echec' });
  });

  it('rend « illisible » pour un Word qui ne s’ouvre pas', async () => {
    const abime = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(await lireLeCv(abime, 'docx')).toEqual({ ok: false, raison: 'illisible' });
    expect(parse).not.toHaveBeenCalled();
  });
});
