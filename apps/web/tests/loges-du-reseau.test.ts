import { describe, expect, it } from 'vitest';
import {
  aEnvoyerEnGroupe,
  composerLeCourriel,
  compter,
  dateEnLettres,
  etatDeLaLoge,
  filtrerLoges,
  libelleDeLEnvoiGroupe,
  libelleDeLEtat,
  lienDeLaLogeDuReseau,
  lireLoges,
  lirePage,
  nomDansLeCourriel,
  type LogeDuReseau,
} from '../src/lib/loges-du-reseau';

// Des loges du réseau inventées.
const maintenant = new Date('2026-11-13T12:00:00Z');
const loge = (p: Partial<LogeDuReseau>): LogeDuReseau => ({
  id: p.id ?? 'x',
  nom: p.nom ?? 'L’Essai',
  numero: p.numero ?? null,
  province_id: null,
  province: p.province ?? null,
  secretaire_nom: p.secretaire_nom ?? null,
  secretaire_email: p.secretaire_email ?? null,
  lien_envoye_le: p.lien_envoye_le ?? null,
  lien_expire_le: p.lien_expire_le ?? null,
  secteurs_maj_le: p.secteurs_maj_le ?? null,
  secteurs: p.secteurs ?? [],
});

const sans = loge({ id: 'sans', secretaire_email: 'a@example.org' });
const sansAdresse = loge({ id: 'sans-adresse' });
const envoye = loge({ id: 'envoye', lien_envoye_le: '2026-10-30T10:00:00Z', lien_expire_le: '2027-01-28T10:00:00Z' });
const expire = loge({ id: 'expire', lien_envoye_le: '2026-08-01T10:00:00Z', lien_expire_le: '2026-10-30T10:00:00Z' });
const repondu = loge({
  id: 'repondu',
  nom: 'Les Bâtisseurs',
  numero: '507',
  secretaire_nom: 'Camille Essai',
  lien_envoye_le: '2026-08-01T10:00:00Z',
  lien_expire_le: '2026-10-30T10:00:00Z',
  secteurs: [{ code: '43', intitule: 'Travaux de construction spécialisés' }],
});

describe('l’état d’une loge du réseau', () => {
  it('dans l’ordre où il compte', () => {
    expect(etatDeLaLoge(sans, maintenant)).toBe('sans');
    expect(etatDeLaLoge(envoye, maintenant)).toBe('envoye');
    expect(etatDeLaLoge(expire, maintenant)).toBe('expire');
  });

  it('une loge qui a coché a répondu, même si son lien a expiré depuis', () => {
    expect(etatDeLaLoge(repondu, maintenant)).toBe('repondu');
  });

  it('se dit comme la maquette validée', () => {
    expect(libelleDeLEtat(sans, maintenant)).toBe('Pas encore de lien');
    expect(libelleDeLEtat(envoye, maintenant)).toBe('Lien envoyé le 30 oct., sans réponse');
    expect(libelleDeLEtat(expire, maintenant)).toBe('Lien expiré, sans réponse');
    expect(libelleDeLEtat(repondu, maintenant)).toBe('A répondu · 1 secteur');
  });

  it('se compte', () => {
    expect(compter([sans, sansAdresse, envoye, expire, repondu], maintenant)).toEqual({
      total: 5,
      sans: 2,
      envoye: 1,
      expire: 1,
      repondu: 1,
    });
  });
});

describe('l’envoi groupé', () => {
  it('n’écrit qu’aux loges sans lien qui ont une adresse', () => {
    expect(aEnvoyerEnGroupe([sans, sansAdresse, envoye, repondu]).map((l) => l.id)).toEqual(['sans']);
  });

  it('accorde son bouton', () => {
    expect(libelleDeLEnvoiGroupe(0)).toBe('Toutes les loges ont reçu leur lien');
    expect(libelleDeLEnvoiGroupe(1)).toBe('Envoyer le lien à la loge qui ne l’a pas reçu');
    expect(libelleDeLEnvoiGroupe(12)).toBe('Envoyer le lien aux 12 loges qui ne l’ont pas reçu');
  });
});

describe('filtrer et chercher', () => {
  const toutes = [sans, envoye, expire, repondu];

  it('par état', () => {
    expect(filtrerLoges(toutes, 'envoye', '', maintenant).map((l) => l.id)).toEqual(['envoye']);
    expect(filtrerLoges(toutes, 'toutes', '', maintenant)).toHaveLength(4);
  });

  it('par nom, numéro ou Secrétaire, sans accents ni majuscules', () => {
    expect(filtrerLoges(toutes, 'toutes', 'batisseurs', maintenant).map((l) => l.id)).toEqual(['repondu']);
    expect(filtrerLoges(toutes, 'toutes', '507', maintenant).map((l) => l.id)).toEqual(['repondu']);
    expect(filtrerLoges(toutes, 'toutes', 'camille', maintenant).map((l) => l.id)).toEqual(['repondu']);
  });
});

describe('le courriel', () => {
  const modele = { objet: 'HERACLES — {loge}', texte: 'Bonjour {secretaire},\n{lien}\njusqu’au {expiration}. {inconnue}' };

  it('remplace les variables', () => {
    const c = composerLeCourriel(modele, {
      secretaire: 'Camille Essai',
      loge: nomDansLeCourriel(repondu),
      lien: 'https://essai.test/loge-du-reseau/abc',
      expiration: '11 février 2027',
    });
    expect(c.sujet).toBe('HERACLES — Les Bâtisseurs (n° 507)');
    expect(c.texte).toBe(
      'Bonjour Camille Essai,\nhttps://essai.test/loge-du-reseau/abc\njusqu’au 11 février 2027. {inconnue}',
    );
  });

  it('salue poliment un Secrétaire sans nom', () => {
    expect(
      composerLeCourriel(modele, { secretaire: null, loge: 'L’Essai', lien: 'l', expiration: 'e' }).texte,
    ).toMatch(/^Bonjour Madame, Monsieur,/);
  });

  it('écrit le lien de la page', () => {
    expect(lienDeLaLogeDuReseau('https://essai.test/', 'abc')).toBe('https://essai.test/loge-du-reseau/abc');
  });

  it('écrit la date en lettres, à l’heure de Paris', () => {
    expect(dateEnLettres('2027-02-10T23:30:00Z')).toBe('11 février 2027');
  });
});

describe('ce que la base rend', () => {
  it('la page d’un lien valable', () => {
    const page = lirePage({
      etat: 'valable',
      nom: 'L’Essai',
      numero: '512',
      province: null,
      secretaire_nom: 'Dominique Modèle',
      expire_le: '2027-02-11T10:00:00Z',
      liste: { maj_le: null, modifiable: true, secteurs: [] },
    });
    expect(page && page.etat === 'valable' && page.liste.modifiable).toBe(true);
  });

  it('expiré, inconnu, ou mal formé', () => {
    expect(lirePage({ etat: 'expire' })).toEqual({ etat: 'expire' });
    expect(lirePage(null)).toBeNull();
    expect(lirePage({ etat: 'valable', nom: 'X' })).toEqual({ etat: 'expire' });
  });

  it('la liste de l’administration, lignes mal formées écartées', () => {
    expect(lireLoges([sans, { id: 'abîmée' }])).toHaveLength(1);
    expect(lireLoges(null)).toEqual([]);
  });
});
