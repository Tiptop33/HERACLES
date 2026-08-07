import { describe, expect, it } from 'vitest';
import { filtrerAnnuaire, resumeDeLAnnuaire, type FicheAnnuaire } from '../src/lib/annuaire';

const fiche = (p: Partial<FicheAnnuaire>): FicheAnnuaire => ({
  id: p.id ?? 'x',
  nom: p.nom ?? null,
  prenom: p.prenom ?? null,
  email: p.email ?? null,
  telephone: p.telephone ?? null,
  photo_url: null,
  college: p.college ?? null,
  loge_id: null,
  loge_nom: p.loge_nom ?? null,
  compte_rattache: p.compte_rattache ?? true,
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
