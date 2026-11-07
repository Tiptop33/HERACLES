import { describe, expect, it } from 'vitest';
import { InvitationCandidat, refusDInvitation } from '../src/lib/espace-candidat';
import { premiereErreur } from '../src/lib/parrainage';

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
