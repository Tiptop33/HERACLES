import { describe, expect, it } from 'vitest';
import {
  VUES,
  chercher,
  estVue,
  filtrerParVue,
  nomDeFamilleDabord,
  resumeDeLaVue,
  sousTitreDuRang,
  vueDOuverture,
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
  archive: p.archive ?? null,
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
  ligne({ id: 'e', nom: 'Range', prenom: 'Yves', metier: 'Magasinier', ville: 'Metz',
          archive: 'Sans nouvelles', c_est_mon_suivi: true }),
];

describe('les quatre vues du volet', () => {
  it('reconnaît les quatre, et refuse le reste', () => {
    expect(VUES.map((v) => v.valeur)).toEqual(['mes', 'loge', 'clotures', 'archives']);
    expect(estVue('archives')).toBe(true);
    expect(estVue('tous')).toBe(false);
    expect(estVue(undefined)).toBe(false);
  });

  it('« Mes candidats » : ceux qu’on suit ou qu’on parraine, refermés exclus', () => {
    expect(filtrerParVue(loge, 'mes').map((l) => l.id)).toEqual(['a']);
  });

  it('« La loge » ne montre ni les clôturés ni les archivés', () => {
    expect(filtrerParVue(loge, 'loge').map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('« Clôturés » et « Archivés » sont deux vues distinctes', () => {
    expect(filtrerParVue(loge, 'clotures').map((l) => l.id)).toEqual(['d']);
    expect(filtrerParVue(loge, 'archives').map((l) => l.id)).toEqual(['e']);
  });

  it('un dossier à la fois clôturé et archivé se retrouve des deux côtés', () => {
    const deuxFois = [ligne({ id: 'f', cloture: 'Embauché', archive: 'Rangé' })];
    expect(filtrerParVue(deuxFois, 'clotures').map((l) => l.id)).toEqual(['f']);
    expect(filtrerParVue(deuxFois, 'archives').map((l) => l.id)).toEqual(['f']);
    expect(filtrerParVue(deuxFois, 'loge')).toEqual([]);
  });

  it('une valeur qui n’est que des blancs ne referme rien', () => {
    const flou = [ligne({ id: 'g', cloture: '   ', archive: '' })];
    expect(filtrerParVue(flou, 'loge').map((l) => l.id)).toEqual(['g']);
    expect(filtrerParVue(flou, 'clotures')).toEqual([]);
    expect(filtrerParVue(flou, 'archives')).toEqual([]);
  });

  // Les valeurs de ces deux listes de choix Bubble n'ont jamais été relevées.
  // Si l'une d'elles est un oui/non, un « Non » ne doit pas vider l'écran de
  // tout le monde.
  it('une valeur qui dit « non » ne referme rien non plus', () => {
    for (const mot of ['Non', 'non', 'NON', 'Non archivé', 'Aucune', 'false', '0']) {
      const dit = [ligne({ id: 'h', archive: mot })];
      expect(filtrerParVue(dit, 'loge').map((l) => l.id), mot).toEqual(['h']);
      expect(filtrerParVue(dit, 'archives'), mot).toEqual([]);
    }
  });

  it('mais « Nonobstant » n’est pas une négation — on ne coupe pas au milieu d’un mot', () => {
    const mot = [ligne({ id: 'i', archive: 'Nonobstant' })];
    expect(filtrerParVue(mot, 'archives').map((l) => l.id)).toEqual(['i']);
  });
});

describe('la recherche du volet', () => {
  it('rend tout quand on n’a rien tapé', () => {
    expect(chercher(loge, '   ')).toHaveLength(5);
  });

  it('trouve par le nom, sans se soucier de la casse', () => {
    expect(chercher(loge, 'martin').map((l) => l.id)).toEqual(['a']);
    expect(chercher(loge, 'BENALI').map((l) => l.id)).toEqual(['b']);
  });

  it('trouve par le métier, la ville et le numéro', () => {
    expect(chercher(loge, 'soud').map((l) => l.id)).toEqual(['c']);
    expect(chercher(loge, 'Metz').map((l) => l.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(chercher(loge, '803').map((l) => l.id)).toEqual(['a']);
  });

  it('trouve par le nom de qui accompagne : « qui suit Rosa ? »', () => {
    expect(chercher(loge, 'rosa').map((l) => l.id)).toEqual(['b']);
  });

  it('ne rend rien plutôt que n’importe quoi', () => {
    expect(chercher(loge, 'zzz')).toEqual([]);
  });
});

describe('la vue d’ouverture', () => {
  it('« Mes candidats » quand on en accompagne', () => {
    expect(vueDOuverture(loge)).toBe('mes');
  });

  // Un administrateur n'a pas de fiche de référent : il n'accompagne personne.
  it('« La loge » quand on n’accompagne personne — jamais un écran vide', () => {
    expect(vueDOuverture([ligne({ id: 'z' })])).toBe('loge');
    expect(vueDOuverture([])).toBe('loge');
  });

  it('un dossier refermé ne compte pas comme un suivi en cours', () => {
    expect(vueDOuverture([ligne({ cloture: 'Embauché', c_est_mon_suivi: true })])).toBe('loge');
  });
});

describe('le décompte en tête du volet', () => {
  // Il porte sur ce que la vue montre : un décompte qui annonce treize
  // au-dessus d'une liste de deux ne compte rien du tout.
  it('compte ce que la vue affiche', () => {
    expect(resumeDeLaVue(filtrerParVue(loge, 'loge'), 'loge')).toBe('3 en cours');
    expect(resumeDeLaVue(filtrerParVue(loge, 'mes'), 'mes')).toBe('1 en cours');
  });

  it('accorde le mot à la vue', () => {
    expect(resumeDeLaVue(filtrerParVue(loge, 'clotures'), 'clotures')).toBe('1 clôturé');
    expect(resumeDeLaVue(filtrerParVue(loge, 'archives'), 'archives')).toBe('1 archivé');
    expect(resumeDeLaVue([ligne({}), ligne({})], 'clotures')).toBe('2 clôturés');
  });

  it('le dit quand il n’y a personne', () => {
    expect(resumeDeLaVue([], 'mes')).toBe('aucun');
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
