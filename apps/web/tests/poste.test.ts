import { describe, expect, it } from 'vitest';
import {
  VUES,
  chercher,
  estVue,
  filtrerParVue,
  nomDeFamilleDabord,
  resumeDeLaLoge,
  sousTitreDuRang,
  type LigneCandidat,
} from '../src/lib/poste';

const ligne = (p: Partial<LigneCandidat>): LigneCandidat => ({
  id: p.id ?? 'x',
  numero: p.numero ?? null,
  nom: p.nom ?? null,
  prenom: p.prenom ?? null,
  age: p.age ?? null,
  metier: p.metier ?? null,
  ville: p.ville ?? null,
  cloture: p.cloture ?? null,
  loge_id: p.loge_id ?? null,
  loge_nom: p.loge_nom ?? null,
  referent_nom: p.referent_nom ?? null,
  a_une_photo: p.a_une_photo ?? false,
  c_est_mon_suivi: p.c_est_mon_suivi ?? false,
  sans_referent: p.sans_referent ?? false,
});

const loge = [
  ligne({ id: 'a', nom: 'Martin', prenom: 'Julie', metier: 'Consultant RH', ville: 'Metz',
          numero: 803, referent_nom: 'Paul Durand', c_est_mon_suivi: true }),
  ligne({ id: 'b', nom: 'Benali', prenom: 'Karim', metier: 'Comptable', ville: 'Nancy',
          referent_nom: 'Rosa Klein' }),
  ligne({ id: 'c', nom: 'Nguyen', prenom: 'Léa', metier: 'Soudeuse', ville: 'Metz',
          sans_referent: true }),
  ligne({ id: 'd', nom: 'Clos', prenom: 'Paul', metier: 'Chaudronnier', ville: 'Metz',
          cloture: 'Embauché', c_est_mon_suivi: true }),
];

describe('les quatre vues du volet', () => {
  it('reconnaît celles que la maquette dessine, et refuse le reste', () => {
    expect(VUES.map((v) => v.valeur)).toEqual(['tous', 'urgents', 'suivis', 'clotures']);
    expect(estVue('urgents')).toBe(true);
    expect(estVue('archives')).toBe(false);
    expect(estVue(undefined)).toBe(false);
  });

  it('« Tous » ne montre pas les dossiers refermés', () => {
    expect(filtrerParVue(loge, 'tous').map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('« Urgents » : ceux que personne n’accompagne', () => {
    expect(filtrerParVue(loge, 'urgents').map((l) => l.id)).toEqual(['c']);
  });

  it('« Mes suivis » laisse de côté celui qui est clôturé', () => {
    expect(filtrerParVue(loge, 'suivis').map((l) => l.id)).toEqual(['a']);
  });

  it('« Clôturés » les rend atteignables — refermer n’est pas effacer', () => {
    expect(filtrerParVue(loge, 'clotures').map((l) => l.id)).toEqual(['d']);
  });

  it('une clôture qui n’est que des blancs ne referme rien', () => {
    const flou = [ligne({ id: 'e', cloture: '   ' })];
    expect(filtrerParVue(flou, 'tous').map((l) => l.id)).toEqual(['e']);
    expect(filtrerParVue(flou, 'clotures')).toEqual([]);
  });
});

describe('la recherche du volet', () => {
  it('rend tout quand on n’a rien tapé', () => {
    expect(chercher(loge, '   ')).toHaveLength(4);
  });

  it('trouve par le nom, sans se soucier de la casse', () => {
    expect(chercher(loge, 'martin').map((l) => l.id)).toEqual(['a']);
    expect(chercher(loge, 'BENALI').map((l) => l.id)).toEqual(['b']);
  });

  it('trouve par le métier, la ville et le numéro', () => {
    expect(chercher(loge, 'soud').map((l) => l.id)).toEqual(['c']);
    expect(chercher(loge, 'Metz').map((l) => l.id)).toEqual(['a', 'c', 'd']);
    expect(chercher(loge, '803').map((l) => l.id)).toEqual(['a']);
  });

  it('trouve par le nom de qui accompagne : « qui suit Rosa ? »', () => {
    expect(chercher(loge, 'rosa').map((l) => l.id)).toEqual(['b']);
  });

  it('ne rend rien plutôt que n’importe quoi', () => {
    expect(chercher(loge, 'zzz')).toEqual([]);
  });
});

describe('le décompte en tête du volet', () => {
  it('compte les dossiers ouverts, pas les lignes', () => {
    expect(resumeDeLaLoge(loge)).toBe('3 en cours');
  });

  it('le dit quand il n’y a personne', () => {
    expect(resumeDeLaLoge([])).toBe('aucun');
  });

  it('le dit aussi quand tout est refermé', () => {
    expect(resumeDeLaLoge([ligne({ cloture: 'Embauché' })])).toBe('tous clôturés');
  });
});

describe('ce qu’un rang affiche', () => {
  it('met le nom de famille devant : c’est par là qu’on cherche quelqu’un', () => {
    expect(nomDeFamilleDabord('Martin', 'Julie')).toBe('Martin Julie');
  });

  it('se contente de ce qu’il a', () => {
    expect(nomDeFamilleDabord(null, 'Julie')).toBe('Julie');
    expect(nomDeFamilleDabord('  ', null)).toBe('Sans nom');
  });

  it('donne le métier et la ville, et saute ce qui manque', () => {
    expect(sousTitreDuRang(loge[0])).toBe('Consultant RH · Metz');
    expect(sousTitreDuRang(ligne({ ville: 'Metz' }))).toBe('Metz');
    expect(sousTitreDuRang(ligne({}))).toBe('');
  });
});
