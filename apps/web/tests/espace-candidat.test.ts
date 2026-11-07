import { describe, expect, it } from 'vitest';
import {
  InvitationCandidat,
  anciennesLettres,
  formatAccepte,
  premierEcran,
  refusDInvitation,
} from '../src/lib/espace-candidat';
import { FicheAuPremierEnvoi, FicheDuCandidat, premiereErreur } from '../src/lib/parrainage';

const complet = {
  email: ' Lucie@Example.org ',
  parrain_nom: 'Dupont',
  parrain_prenom: 'Victor',
  parrain_loge: '1234',
  parrain_email: 'victor@example.org',
  loge_id: '0b8f6c2e-3d4a-4c1b-9e7f-1a2b3c4d5e6f',
};

describe('InvitationCandidat', () => {
  it('accepte une fenêtre remplie, et nettoie les blancs', () => {
    const lu = InvitationCandidat.parse(complet);
    expect(lu.email).toBe('Lucie@Example.org');
    expect(lu.parrain_loge).toBe('1234');
  });

  it.each([
    ['email', 'Indiquez l’adresse e-mail du candidat.'],
    ['parrain_nom', 'Indiquez le nom du parrain.'],
    ['parrain_prenom', 'Indiquez le prénom du parrain.'],
    ['parrain_loge', 'Indiquez le numéro de loge du parrain.'],
    ['parrain_email', 'Indiquez l’adresse e-mail du parrain.'],
  ])('dit quand %s manque', (champ, message) => {
    const lu = InvitationCandidat.safeParse({ ...complet, [champ]: '   ' });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error)).toEqual({ champ, message });
  });

  it('exige une loge du dossier', () => {
    const lu = InvitationCandidat.safeParse({ ...complet, loge_id: '' });
    expect(lu.success).toBe(false);
    if (!lu.success) {
      expect(premiereErreur(lu.error)).toEqual({
        champ: 'loge_id',
        message: 'Choisissez la loge du dossier.',
      });
    }
  });

  it('refuse une adresse qui n’en est pas une', () => {
    const lu = InvitationCandidat.safeParse({ ...complet, parrain_email: 'victor' });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('parrain_email');
  });
});

describe('refusDInvitation', () => {
  it('dit qu’un compte existe déjà', () => {
    expect(refusDInvitation({ code: '23505', message: 'Cette adresse a déjà un compte' })).toEqual({
      message: 'Cette adresse a déjà un compte.',
      statut: 409,
    });
  });

  it('dit qu’un dossier existe déjà', () => {
    const refus = refusDInvitation({ code: '23505', message: 'Un dossier existe déjà pour cette adresse' });
    expect(refus.statut).toBe(409);
    expect(refus.message).toMatch(/dossier existe déjà/);
  });

  it('ferme la porte à qui n’est pas administrateur', () => {
    expect(refusDInvitation({ code: '42501', message: 'Seul un administrateur peut inviter' }).statut).toBe(
      403,
    );
  });

  it('ne recopie jamais un message technique', () => {
    expect(refusDInvitation({ code: 'XX000', message: 'relation "x" does not exist' })).toEqual({
      message: 'Le dossier n’a pas pu être ouvert.',
      statut: 400,
    });
    expect(refusDInvitation(null).statut).toBe(400);
  });
});

describe('premierEcran', () => {
  it('demande d’abord le CV', () => {
    expect(premierEcran({ a_un_cv: false, candidature_completee_le: null }, false)).toBe('cv');
  });

  it('montre la fiche dès que le CV est là, ou qu’elle a été enregistrée, ou sans CV', () => {
    expect(premierEcran({ a_un_cv: true, candidature_completee_le: null }, false)).toBe('fiche');
    expect(premierEcran({ a_un_cv: false, candidature_completee_le: '2026-11-07' }, false)).toBe('fiche');
    expect(premierEcran({ a_un_cv: false, candidature_completee_le: null }, true)).toBe('fiche');
  });
});

describe('formatAccepte', () => {
  it('ne prend qu’un PDF pour le CV', () => {
    expect(formatAccepte('cv', 'pdf')).toBe(true);
    expect(formatAccepte('cv', 'docx')).toBe(false);
    expect(formatAccepte('cv', null)).toBe(false);
  });

  it('garde les formats de 0057 pour la lettre', () => {
    expect(formatAccepte('lettre', 'docx')).toBe(true);
    expect(formatAccepte('lettre', 'jpg')).toBe(true);
    expect(formatAccepte('lettre', 'exe')).toBe(false);
  });
});

describe('anciennesLettres', () => {
  it('nomme les autres formats, jamais celui qu’on vient de déposer', () => {
    const chemins = anciennesLettres('abc', 'pdf');
    expect(chemins).toContain('candidat/lettre/abc.docx');
    expect(chemins).not.toContain('candidat/lettre/abc.pdf');
    expect(chemins).toHaveLength(7);
  });
});

describe('la fiche de l’espace candidat', () => {
  const fiche = {
    prenom: 'Lucie',
    nom: 'Martin',
    telephone: '0600000000',
    age: '27',
    situation_familiale: 'Marié',
    adresse: '1 rue des Lilas',
    code_postal: '33000',
    ville: 'Bordeaux',
    type_emploi: 'emploi',
    emploi_recherche: 'Aide-soignante',
    definition_emploi: 'AIDE-SOIGNANTE EN EHPAD',
    mobilite_geographique: 'Départementale',
    permis_vl: 'Oui',
    permis_moto: 'Non',
    permis_pl: 'Non',
    vehicule: 'Oui',
    formations: 'DEAS',
    experiences: 'Trois ans en EHPAD',
    competences: 'Soins',
  };

  it('n’exige ni e-mail ni consentement une fois la fiche enregistrée', () => {
    expect(FicheDuCandidat.safeParse(fiche).success).toBe(true);
  });

  it('exige le consentement au premier envoi', () => {
    const lu = FicheAuPremierEnvoi.safeParse(fiche);
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('consentement');
    expect(FicheAuPremierEnvoi.safeParse({ ...fiche, consentement: 'oui' }).success).toBe(true);
  });

  it('garde les règles de 0057 : un stage ne finit pas avant de commencer', () => {
    const lu = FicheDuCandidat.safeParse({
      ...fiche,
      type_emploi: 'stage',
      debut_stage: '2027-03-01',
      fin_stage: '2027-01-01',
    });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('fin_stage');
  });
});
