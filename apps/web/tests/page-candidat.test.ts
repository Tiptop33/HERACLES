import { describe, expect, it } from 'vitest';
import {
  CLES_MODIFIABLES,
  SECTIONS_DE_LA_FICHE,
  autoriserUnLien,
  basculer,
  cheminDUnDocument,
  cheminDeLaPhoto,
  courrielDAlerte,
  courrielDInvitationALaPage,
  departementsAProposer,
  estCleModifiable,
  initialesDe,
  lireDepartements,
  lireFicheDuCandidat,
  nomDepuisLeFichier,
  ordreDuStage,
  parueIlYA,
  quand,
  remplissage,
  taillePourLire,
  tempsPourCorriger,
  validerUnChamp,
  validerUnMessage,
  validerUnNom,
  type FicheDuCandidat,
} from '../src/lib/page-candidat';

const H = 60 * 60 * 1000;

function fiche(maj: Partial<FicheDuCandidat> = {}): FicheDuCandidat {
  const base = lireFicheDuCandidat({
    id: 'c1',
    numero: 857,
    prenom: 'Inès',
    nom: 'Moreau',
    email: 'ines@exemple.fr',
    telephone: '06 12 34 56 78',
    a_une_photo: false,
    secteurs: [],
  });
  if (!base) throw new Error('fiche illisible');
  return { ...base, ...maj };
}

describe('les champs de la fiche', () => {
  it('ne laisse modifier que les colonnes du candidat', () => {
    expect(estCleModifiable('telephone')).toBe(true);
    for (const interdit of ['appreciation', 'referent_id', 'profil_id', 'urgence', 'connait_appartenance', 'email']) {
      expect(estCleModifiable(interdit)).toBe(false);
    }
  });

  it('décrit chaque colonne modifiable une fois, et seulement elles', () => {
    const decrites = SECTIONS_DE_LA_FICHE.flatMap((s) => s.champs.map((c) => c.cle));
    expect([...decrites].sort()).toEqual([...CLES_MODIFIABLES].sort());
  });

  it('exige le prénom, le nom et le téléphone, et laisse le reste facultatif', () => {
    expect(validerUnChamp('prenom', '  ')).toEqual({ ok: false, message: 'Indiquez votre prénom.' });
    expect(validerUnChamp('ville', '')).toEqual({ ok: true, valeur: '' });
    expect(validerUnChamp('telephone', '06 12')).toMatchObject({ ok: false });
    expect(validerUnChamp('telephone', ' 06 12 34 56 78 ')).toEqual({ ok: true, valeur: '06 12 34 56 78' });
  });

  it('borne l’âge, le code postal et les dates', () => {
    expect(validerUnChamp('age', '13')).toMatchObject({ ok: false });
    expect(validerUnChamp('age', '24')).toEqual({ ok: true, valeur: '24' });
    expect(validerUnChamp('code_postal', '33<script>')).toMatchObject({ ok: false });
    expect(validerUnChamp('debut_stage', '2027-02-30')).toMatchObject({ ok: false });
    expect(validerUnChamp('debut_stage', '2027-01-04')).toEqual({ ok: true, valeur: '2027-01-04' });
    expect(ordreDuStage('2027-02-01', '2027-01-01')).toBe('La fin précède le début.');
    expect(ordreDuStage('2027-01-01', null)).toBeNull();
  });

  it('refuse une valeur hors des listes de choix', () => {
    expect(validerUnChamp('situation_familiale', 'le fils')).toMatchObject({ ok: false });
    expect(validerUnChamp('situation_familiale', 'Célibataire')).toEqual({ ok: true, valeur: 'Célibataire' });
    expect(validerUnChamp('permis_vl', 'Peut-être')).toMatchObject({ ok: false });
    expect(validerUnChamp('type_emploi', 'stage en alternance')).toMatchObject({ ok: true });
  });
});

describe('la jauge', () => {
  it('compte la photo et les secteurs, et les dates seulement pour un stage', () => {
    const sansStage = remplissage(fiche({ type_emploi: 'emploi' }));
    expect(sansStage.manquent[0]).toEqual({ cle: 'photo', libelle: 'Ma photo' });
    expect(sansStage.manquent.some((m) => m.cle === 'debut_stage')).toBe(false);
    expect(sansStage.manquent.some((m) => m.cle === 'secteurs')).toBe(true);

    const stage = remplissage(fiche({ type_emploi: 'stage' }));
    expect(stage.manquent.some((m) => m.cle === 'debut_stage')).toBe(true);
  });

  it('atteint 100 % quand tout est rempli', () => {
    const pleine: Partial<FicheDuCandidat> = { a_une_photo: true, secteurs: [{} as never], type_emploi: 'emploi' };
    for (const s of SECTIONS_DE_LA_FICHE) for (const c of s.champs) if (!pleine[c.cle]) (pleine as Record<string, unknown>)[c.cle] = c.cle === 'age' ? 30 : 'x';
    pleine.type_emploi = 'emploi';
    expect(remplissage(fiche(pleine)).pourcentage).toBe(100);
  });
});

describe('les documents', () => {
  it('range chaque fichier dans le dossier du candidat', () => {
    expect(cheminDUnDocument('c1', 'd1', 'pdf')).toBe('candidat/documents/c1/d1.pdf');
    expect(cheminDeLaPhoto('c1', 'webp')).toBe('candidat/photo/c1.webp');
  });

  it('propose le nom du fichier, sans son extension', () => {
    expect(nomDepuisLeFichier('CV_maçon_2026.pdf')).toBe('CV maçon 2026');
    expect(nomDepuisLeFichier('.pdf')).toBe('Document');
    expect(nomDepuisLeFichier(`${'a'.repeat(100)}.docx`)).toHaveLength(80);
  });

  it('veut un nom, de 80 caractères au plus', () => {
    expect(validerUnNom('  ')).toMatchObject({ ok: false });
    expect(validerUnNom('a'.repeat(81))).toMatchObject({ ok: false });
    expect(validerUnNom(' CV métreuse ')).toEqual({ ok: true, valeur: 'CV métreuse' });
  });

  it('dit les tailles en Ko et en Mo', () => {
    expect(taillePourLire(421_000)).toBe('411 Ko');
    expect(taillePourLire(1_500_000)).toBe('1,4 Mo');
    expect(taillePourLire(null)).toBeNull();
  });
});

describe('les messages', () => {
  const maintenant = Date.parse('2026-11-25T10:00:00Z');

  it('se corrigent 24 heures, puis plus', () => {
    expect(tempsPourCorriger(new Date(maintenant - 2 * H).toISOString(), maintenant)).toBe('22 h');
    expect(tempsPourCorriger(new Date(maintenant - 24 * H + 10 * 60000).toISOString(), maintenant)).toBe('10 min');
    expect(tempsPourCorriger(new Date(maintenant - 25 * H).toISOString(), maintenant)).toBeNull();
  });

  it('ne partent pas vides, ni trop longs', () => {
    expect(validerUnMessage('   ')).toMatchObject({ ok: false });
    expect(validerUnMessage('x'.repeat(2001))).toMatchObject({ ok: false });
    expect(validerUnMessage(' Entretien jeudi ')).toEqual({ ok: true, valeur: 'Entretien jeudi' });
  });

  it('se datent à l’heure de Paris', () => {
    expect(quand('2026-11-25T08:15:00Z', maintenant)).toBe('Aujourd’hui, 9 h 15');
    expect(quand('2026-11-24T17:10:00Z', maintenant)).toBe('Hier, 18 h 10');
    expect(quand('2026-11-20T16:40:00Z', maintenant)).toBe('20 nov., 17 h 40');
  });
});

describe('les offres', () => {
  it('propose les départements qui ont des offres, et ceux déjà cochés', () => {
    const proposes = departementsAProposer({
      total: 0,
      nouvelles: 0,
      choisis: ['64'],
      departements: [{ code: '40', nombre: 2 }, { code: '33', nombre: 5 }],
      offres: [],
    });
    expect(proposes).toEqual([
      { code: '33', nombre: 5 },
      { code: '40', nombre: 2 },
      { code: '64', nombre: 0 },
    ]);
  });

  it('coche et décoche un département', () => {
    expect(basculer(['33'], '40')).toEqual(['33', '40']);
    expect(basculer(['33', '40'], '33')).toEqual(['40']);
  });

  it('ne retient que des numéros de département', () => {
    expect(lireDepartements(['40', '33', '33'])).toEqual(['33', '40']);
    expect(lireDepartements(['2A', '971'])).toEqual(['2A', '971']);
    expect(lireDepartements(['33; drop'])).toBeNull();
    expect(lireDepartements('33')).toBeNull();
  });

  it('dit depuis quand une offre est parue', () => {
    const maintenant = Date.parse('2026-11-25T10:00:00Z');
    expect(parueIlYA('2026-11-25T08:00:00Z', maintenant)).toBe('aujourd’hui');
    expect(parueIlYA('2026-11-24T08:00:00Z', maintenant)).toBe('hier');
    expect(parueIlYA('2026-11-20T08:00:00Z', maintenant)).toBe('il y a 5 j');
    expect(parueIlYA(null, maintenant)).toBeNull();
  });
});

describe('les courriels', () => {
  it('invitent le candidat avec son lien', () => {
    const m = courrielDInvitationALaPage('Inès', 'https://heracles.example/invitation-candidat/abc');
    expect(m.sujet).toBe('Votre espace candidat est prêt');
    expect(m.texte).toContain('Bonjour Inès,');
    expect(m.texte).toContain('https://heracles.example/invitation-candidat/abc');
  });

  it('préviennent le référent sans jamais recopier le message', () => {
    const m = courrielDAlerte('Marc', 'Inès Moreau', 857, 'https://heracles.example/espace/candidats?fiche=c1');
    expect(m.sujet).toBe('Inès Moreau vous a laissé un message');
    expect(m.texte).toContain('dossier n° 857');
    expect(m.texte).not.toContain('Entretien');
  });
});

describe('les liens de connexion', () => {
  it('trois par adresse et par quart d’heure, quelle que soit la casse', () => {
    const journal = new Map<string, number[]>();
    const t = 1_000_000;
    expect(autoriserUnLien(journal, 'Ines@Exemple.fr', t)).toBe(true);
    expect(autoriserUnLien(journal, 'ines@exemple.fr', t + 1)).toBe(true);
    expect(autoriserUnLien(journal, 'ines@exemple.fr ', t + 2)).toBe(true);
    expect(autoriserUnLien(journal, 'ines@exemple.fr', t + 3)).toBe(false);
    expect(autoriserUnLien(journal, 'ines@exemple.fr', t + 15 * 60 * 1000 + 1)).toBe(true);
  });
});

describe('les initiales', () => {
  it('prennent la première lettre du prénom et du nom', () => {
    expect(initialesDe('inès', 'moreau')).toBe('IM');
    expect(initialesDe(null, null)).toBe('·');
  });
});
