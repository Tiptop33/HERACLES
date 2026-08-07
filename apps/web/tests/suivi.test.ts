import { describe, expect, it } from 'vitest';
import { CHAMPS_COMPTES, etatDuSuivi, tauxDeRemplissage } from '../src/lib/suivi';

describe('etatDuSuivi', () => {
  it('clôture dès que la raison est renseignée, et la reprend', () => {
    expect(etatDuSuivi({ cloture: 'Embauché' })).toEqual({
      etat: 'clos',
      libelle: 'Clôturé — embauché',
    });
  });

  it('ne répète pas le mot quand la raison le contient déjà', () => {
    expect(etatDuSuivi({ cloture: 'Clôturé' }).libelle).toBe('Clôturé');
    expect(etatDuSuivi({ cloture: 'cloture' }).libelle).toBe('Clôturé');
  });

  it('traite une fiche archivée comme une fiche close', () => {
    expect(etatDuSuivi({ archive: 'Archivé' }).etat).toBe('clos');
  });

  it('ignore une valeur qui ne contient que des blancs', () => {
    expect(etatDuSuivi({ cloture: '   ', archive: null }).etat).not.toBe('clos');
  });

  // Les valeurs de `CLOTURE` et `ARCHIVER` n'ont jamais été relevées : ce sont
  // des listes de choix Bubble que l'API rend en texte libre. Si l'une d'elles
  // est un oui/non, un « Non » ne doit pas clore la fiche de tout le monde.
  it('ignore une valeur qui dit « non »', () => {
    for (const mot of ['Non', 'non', 'Non archivé', 'Aucune', 'false', '0']) {
      expect(etatDuSuivi({ archive: mot }).etat, mot).not.toBe('clos');
    }
  });

  it('mais ne coupe pas au milieu d’un mot', () => {
    expect(etatDuSuivi({ archive: 'Nonobstant' }).etat).toBe('clos');
  });

  it('signale à contacter une fiche jamais retouchée depuis sa création', () => {
    expect(
      etatDuSuivi({
        cree_le: '2026-08-01T10:00:00Z',
        maj_le: '2026-08-01T10:00:00Z',
      }),
    ).toEqual({ etat: 'attente', libelle: 'À contacter' });
  });

  it('tolère les quelques millisecondes entre deux écritures de la reprise', () => {
    expect(
      etatDuSuivi({
        cree_le: '2026-08-01T10:00:00.000Z',
        maj_le: '2026-08-01T10:00:00.400Z',
      }).etat,
    ).toBe('attente');
  });

  it('passe en suivi dès que quelqu’un a touché la fiche', () => {
    expect(
      etatDuSuivi({
        cree_le: '2026-08-01T10:00:00Z',
        maj_le: '2026-08-03T09:00:00Z',
      }),
    ).toEqual({ etat: 'suivi', libelle: 'Suivi' });
  });

  it('reste en suivi quand les dates manquent : on ne conclut pas sans savoir', () => {
    expect(etatDuSuivi({}).etat).toBe('suivi');
  });

  it('la clôture prime sur tout le reste', () => {
    expect(
      etatDuSuivi({
        cloture: 'Embauché',
        cree_le: '2026-08-01T10:00:00Z',
        maj_le: '2026-08-01T10:00:00Z',
      }).etat,
    ).toBe('clos');
  });
});

describe('tauxDeRemplissage', () => {
  it('vaut zéro sur une fiche vide', () => {
    expect(tauxDeRemplissage({})).toBe(0);
  });

  it('compte vingt champs, pas les cinquante de la table', () => {
    expect(CHAMPS_COMPTES).toHaveLength(20);
  });

  it('vaut cent quand les vingt champs sont renseignés', () => {
    expect(
      tauxDeRemplissage({
        nom: 'Martin',
        prenom: 'Alice',
        telephone: '0765730385',
        email: 'a.martin@example.org',
        age: 33,
        ville: 'Bordeaux',
        type_emploi: 'Alternance',
        emploi_recherche: 'Assistante comptable',
        mobilite_geographique: 'Bordeaux Métropole',
        secteur_activite_libelle: 'Comptabilité',
        debut_stage: '2026-09-01T00:00:00Z',
        formations: 'BTS',
        experiences: 'Six ans en cabinet',
        competences: 'Sage, Cegid',
        savoir_etre: 'Rigoureuse',
        informatique: 'Excel',
        permis_vl: 'B',
        cv_url: 'https://exemple.test/cv.pdf',
        lettre_motivation_url: 'https://exemple.test/lettre.pdf',
        cv_anonyme_url: 'https://exemple.test/anonyme.pdf',
      }),
    ).toBe(100);
  });

  it('accepte l’adresse reprise de Bubble à défaut de ville', () => {
    expect(tauxDeRemplissage({ adresse: 'Bordeaux (33000)' })).toBe(5);
    expect(tauxDeRemplissage({ ville: 'Bordeaux', adresse: 'Bordeaux (33000)' })).toBe(5);
  });

  it('compte un document qu’il soit chez nous ou encore chez Bubble', () => {
    expect(tauxDeRemplissage({ cv_url: 'https://bubble.test/cv.pdf' })).toBe(5);
    expect(tauxDeRemplissage({ cv_chemin: 'candidats/1/cv.pdf' })).toBe(5);
    expect(
      tauxDeRemplissage({ cv_chemin: 'candidats/1/cv.pdf', cv_url: 'https://bubble.test/cv.pdf' }),
    ).toBe(5);
  });

  it('ne compte pas une chaîne vide ni des blancs', () => {
    expect(tauxDeRemplissage({ nom: '', prenom: '   ', telephone: null })).toBe(0);
  });

  it('arrondit à l’entier', () => {
    // Trois champs sur vingt : 15 %.
    expect(tauxDeRemplissage({ nom: 'Martin', prenom: 'Alice', age: 33 })).toBe(15);
  });
});
