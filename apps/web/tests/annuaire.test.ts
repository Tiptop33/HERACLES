import { describe, expect, it } from 'vitest';
import {
  SANS_LOGE,
  TOUTES_LES_LOGES,
  choisirLoge,
  filtrerAnnuaire,
  filtrerParLoge,
  logeDOuverture,
  logesDeLAnnuaire,
  resumeDeLAnnuaire,
  type FicheAnnuaire,
} from '../src/lib/annuaire';

const fiche = (p: Partial<FicheAnnuaire>): FicheAnnuaire => ({
  id: p.id ?? 'x',
  nom: p.nom ?? null,
  prenom: p.prenom ?? null,
  email: p.email ?? null,
  telephone: p.telephone ?? null,
  photo_url: null,
  college: p.college ?? null,
  loge_id: p.loge_id ?? null,
  loge_nom: p.loge_nom ?? null,
  compte_rattache: p.compte_rattache ?? true,
  c_est_moi: p.c_est_moi ?? false,
  candidats_suivis: p.candidats_suivis ?? 0,
});

const annuaire = [
  fiche({ id: '1', nom: 'Delorme', prenom: 'Bernard', loge_nom: 'Bordeaux', email: 'b@ex.org' }),
  fiche({ id: '2', nom: 'Vasseur', prenom: 'Claire', loge_nom: 'Toulouse', college: 'Correspondant' }),
  fiche({ id: '3', nom: 'Aubert', prenom: 'Michel', loge_nom: 'Bordeaux', compte_rattache: false }),
];

describe('filtrerAnnuaire', () => {
  it('rend tout quand la recherche est vide', () => {
    expect(filtrerAnnuaire(annuaire, '   ')).toHaveLength(3);
  });

  it('trouve par nom, sans se soucier de la casse', () => {
    expect(filtrerAnnuaire(annuaire, 'vasseur').map((f) => f.id)).toEqual(['2']);
  });

  it('trouve par prénom', () => {
    expect(filtrerAnnuaire(annuaire, 'Michel').map((f) => f.id)).toEqual(['3']);
  });

  it('trouve par loge — c’est ainsi qu’on regroupe une équipe', () => {
    expect(filtrerAnnuaire(annuaire, 'bordeaux').map((f) => f.id)).toEqual(['1', '3']);
  });

  it('trouve par collège et par adresse', () => {
    expect(filtrerAnnuaire(annuaire, 'correspondant').map((f) => f.id)).toEqual(['2']);
    expect(filtrerAnnuaire(annuaire, 'b@ex').map((f) => f.id)).toEqual(['1']);
  });

  it('ne rend rien plutôt que tout quand personne ne correspond', () => {
    expect(filtrerAnnuaire(annuaire, 'zzz')).toHaveLength(0);
  });
});

describe('resumeDeLAnnuaire', () => {
  it('dit le vide sans détour', () => {
    expect(resumeDeLAnnuaire([])).toBe('personne pour l’instant');
  });

  it('accorde le pluriel', () => {
    expect(resumeDeLAnnuaire([fiche({ id: '1' })])).toBe('1 membre');
  });

  it('signale ceux qui ne peuvent pas encore se connecter', () => {
    // Le chiffre qui compte avant la bascule : une fiche reprise de Bubble
    // n'a pas de compte tant que personne n'a invité la personne.
    expect(resumeDeLAnnuaire(annuaire)).toBe('3 membres · 1 sans compte');
  });

  it('ne le signale pas quand tout le monde en a un', () => {
    expect(resumeDeLAnnuaire(annuaire.slice(0, 2))).toBe('2 membres');
  });
});

// ————— Le rangement par loge —————
//
// Trois loges et une fiche orpheline, comme la reprise Bubble les a laissées :
// HERACLES, PYTHAGORE, LA SIMPLICITÉ, et douze personnes sans rattachement.

const deTroisLoges = [
  fiche({ id: 'a', nom: 'Alpha', loge_id: 'h', loge_nom: 'HERACLES', c_est_moi: true }),
  fiche({ id: 'b', nom: 'Beta', loge_id: 'h', loge_nom: 'HERACLES' }),
  fiche({ id: 'c', nom: 'Gamma', loge_id: 'p', loge_nom: 'PYTHAGORE' }),
  fiche({ id: 'd', nom: 'Delta', loge_id: 's', loge_nom: 'LA SIMPLICITE' }),
  fiche({ id: 'e', nom: 'Epsilon' }),
];

describe('logesDeLAnnuaire', () => {
  it('range les loges par nom et met les orphelins à la fin', () => {
    expect(logesDeLAnnuaire(deTroisLoges).map((l) => l.nom)).toEqual([
      'HERACLES',
      'LA SIMPLICITE',
      'PYTHAGORE',
      'Sans loge',
    ]);
  });

  it('ne propose « sans loge » que s’il y a quelqu’un dedans', () => {
    const rattachees = deTroisLoges.filter((f) => f.loge_id);
    expect(logesDeLAnnuaire(rattachees).map((l) => l.valeur)).toEqual(['h', 's', 'p']);
  });

  it('ne laisse pas une loge sans nom disparaître de la liste', () => {
    const liste = logesDeLAnnuaire([fiche({ loge_id: 'z', loge_nom: null })]);
    expect(liste).toEqual([{ valeur: 'z', nom: 'Loge sans nom' }]);
  });
});

describe('logeDOuverture', () => {
  it('ouvre sur la loge de la personne connectée', () => {
    expect(logeDOuverture(deTroisLoges)).toBe('h');
  });

  it('montre tout quand le compte n’a pas de fiche de référent', () => {
    const sansMoi = deTroisLoges.map((f) => ({ ...f, c_est_moi: false }));
    expect(logeDOuverture(sansMoi)).toBe(TOUTES_LES_LOGES);
  });

  it('montre tout quand la fiche de la personne n’a pas de loge', () => {
    expect(logeDOuverture([fiche({ id: 'e', c_est_moi: true })])).toBe(TOUTES_LES_LOGES);
  });
});

describe('choisirLoge', () => {
  it('sans rien dans l’adresse, prend la loge de la personne', () => {
    expect(choisirLoge(deTroisLoges, '')).toBe('h');
  });

  it('obéit à l’adresse quand elle nomme une loge connue', () => {
    expect(choisirLoge(deTroisLoges, 'p')).toBe('p');
    expect(choisirLoge(deTroisLoges, SANS_LOGE)).toBe(SANS_LOGE);
  });

  it('ramène à toutes plutôt que de vider l’écran', () => {
    // Adresse recopiée, fiche déplacée depuis : la loge demandée n'existe
    // plus dans cet annuaire-là.
    expect(choisirLoge(deTroisLoges, 'inconnue')).toBe(TOUTES_LES_LOGES);
    expect(choisirLoge(deTroisLoges, TOUTES_LES_LOGES)).toBe(TOUTES_LES_LOGES);
  });
});

describe('filtrerParLoge', () => {
  it('ne garde que la loge demandée', () => {
    expect(filtrerParLoge(deTroisLoges, 'h').map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('sait retrouver ceux qui ne sont dans aucune', () => {
    expect(filtrerParLoge(deTroisLoges, SANS_LOGE).map((f) => f.id)).toEqual(['e']);
  });

  it('rend tout le monde quand on demande toutes les loges', () => {
    expect(filtrerParLoge(deTroisLoges, TOUTES_LES_LOGES)).toHaveLength(5);
  });
});
