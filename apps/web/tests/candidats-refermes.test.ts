import { describe, expect, it } from 'vitest';
import {
  chercherUnCandidat,
  estUneListeRefermee,
  type CandidatReferme,
} from '../src/lib/candidats-refermes';
import { correspond } from '../src/lib/documents/archives';
import { enCandidatReferme, type LigneCandidat } from '../src/lib/poste';

const ligne = (surcharge: Partial<LigneCandidat>): LigneCandidat => ({
  id: '11111111-1111-4111-8111-111111111111',
  numero: 812,
  nom: 'MARTIN',
  prenom: 'Julie',
  age: null,
  metier: 'Comptable',
  ville: 'Bordeaux',
  cloture: 'Lui-même',
  archive: 'Oui',
  loge_id: null,
  loge_nom: null,
  referent_nom: null,
  a_une_photo: false,
  c_est_mon_suivi: false,
  sans_referent: true,
  famille: 'emploi',
  supprimable: false,
  ...surcharge,
});

describe('la ligne d’un candidat refermé', () => {
  it('reprend celle de l’écran Candidats, et mène à sa fiche sur la bonne pastille', () => {
    const c = enCandidatReferme(ligne({}), 'candidats-archives');
    expect(c.nom).toBe('MARTIN Julie');
    expect(c.sous).toBe('Comptable · Bordeaux');
    expect(c.initiales).toBe('JM');
    expect(c.lien).toBe('/espace/candidats?vue=archives&fiche=11111111-1111-4111-8111-111111111111');
    expect(enCandidatReferme(ligne({}), 'candidats-clotures').lien).toContain('vue=clotures');
  });
});

describe('la recherche d’un candidat refermé', () => {
  const lignes: CandidatReferme[] = [
    enCandidatReferme(ligne({ id: 'a', numero: 812 }), 'candidats-archives'),
    enCandidatReferme(
      ligne({ id: 'b', numero: 790, nom: 'LEFÈVRE', prenom: 'Élodie', metier: 'Électricienne', ville: 'Mérignac' }),
      'candidats-archives',
    ),
  ];
  const ids = (r: string) => chercherUnCandidat(lignes, r).map((c) => c.id);

  it('trouve par nom, prénom, numéro, métier ou ville, sans accents ni majuscules', () => {
    expect(ids('')).toEqual(['a', 'b']);
    expect(ids('lefevre')).toEqual(['b']);
    expect(ids('elodie')).toEqual(['b']);
    expect(ids('812')).toEqual(['a']);
    expect(ids('comptable bordeaux')).toEqual(['a']);
    expect(ids('merignac electricienne')).toEqual(['b']);
    expect(ids('martin merignac')).toEqual([]);
  });
});

describe('les deux listes', () => {
  it('ne reconnaissent que leurs deux adresses', () => {
    expect(estUneListeRefermee('candidats-clotures')).toBe(true);
    expect(estUneListeRefermee('candidats-archives')).toBe(true);
    expect(estUneListeRefermee('toString')).toBe(false);
    expect(estUneListeRefermee('pdf')).toBe(false);
  });

  it('cherchent comme les colonnes de PDF', () => {
    expect(correspond('Compte-rendu du Mercredi 14 Octobre 2026', 'octobre 14')).toBe(true);
    expect(correspond('812_du_09-07-2026', '812 du')).toBe(true);
    expect(correspond('quoi que ce soit', '   ')).toBe(true);
  });
});
