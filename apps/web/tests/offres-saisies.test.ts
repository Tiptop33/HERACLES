import { describe, expect, it } from 'vitest';
import {
  FICHE_VIDE,
  FicheDOffre,
  champEnCause,
  demandeDeLaFiche,
  departementDuCodePostal,
  dureeAUnSens,
  estEnLigne,
  lireOffreAModifier,
  lireOffresEchues,
  premiereErreurDeLaFiche,
  valeursDeLOffre,
} from '../src/lib/offres-saisies';
import { lirePage } from '../src/lib/offres';

/** Une fiche correcte, à abîmer champ par champ. */
const FICHE = {
  type_offre: 'stage',
  intitule: '  Assistant   de gestion ',
  entreprise: 'Cabinet Exemple',
  code_postal: '33 000',
  ville: 'Bordeaux',
  contrat: null,
  duree: '6 mois',
  secteur: 'm',
  description: '',
  lien: '',
  contact: '',
};

const refus = (fiche: unknown) => {
  const lu = FicheDOffre.safeParse(fiche);
  if (lu.success) throw new Error('fiche acceptée');
  return { message: premiereErreurDeLaFiche(lu.error), champ: champEnCause(lu.error) };
};

describe('la fiche d’une offre saisie', () => {
  it('se range : espaces resserrées, code postal sans espace, secteur en majuscule, vides à null', () => {
    const lu = FicheDOffre.parse(FICHE);
    expect(lu).toMatchObject({
      type_offre: 'stage',
      intitule: 'Assistant de gestion',
      code_postal: '33000',
      secteur: 'M',
      duree: '6 mois',
      description: null,
      lien: null,
      contact: null,
      contrat: null,
    });
  });

  it('refuse ce qui manque, en disant lequel — en français', () => {
    expect(refus({ ...FICHE, type_offre: undefined })).toEqual({
      message: 'Choisissez le type d’offre : emploi, stage ou stage en alternance.',
      champ: 'type_offre',
    });
    expect(refus({ ...FICHE, intitule: '   ' }).champ).toBe('intitule');
    expect(refus({ ...FICHE, entreprise: '' }).message).toBe('Le nom de l’entreprise est requis.');
    expect(refus({ ...FICHE, code_postal: '3300' }).message).toBe('Le code postal compte cinq chiffres.');
    expect(refus({ ...FICHE, ville: '' }).champ).toBe('ville');
    expect(refus({ ...FICHE, secteur: '' }).message).toBe('Choisissez le secteur d’activité de l’offre.');
    expect(refus({ ...FICHE, secteur: '43.21A' }).champ).toBe('secteur');
  });

  it('ne fait un lien que d’une adresse http ou https', () => {
    expect(refus({ ...FICHE, lien: 'javascript:alert(1)' }).champ).toBe('lien');
    expect(FicheDOffre.parse({ ...FICHE, lien: ' https://www.example.com/a ' }).lien).toBe('https://www.example.com/a');
  });

  it('refuse un champ inconnu : on n’écrit en base que ce que la fiche montre', () => {
    expect(() => FicheDOffre.parse({ ...FICHE, origine: 'france_travail' })).toThrow();
  });

  it('ne garde le contrat que pour un emploi, et la durée que lorsqu’elle a un sens', () => {
    expect(FicheDOffre.parse({ ...FICHE, contrat: 'CDD' }).contrat).toBeNull();
    const cdi = FicheDOffre.parse({ ...FICHE, type_offre: 'emploi', contrat: 'CDI', duree: '2 ans' });
    expect(cdi).toMatchObject({ contrat: 'CDI', duree: null });
    const cdd = FicheDOffre.parse({ ...FICHE, type_offre: 'emploi', contrat: 'CDD', duree: '8 mois' });
    expect(cdd).toMatchObject({ contrat: 'CDD', duree: '8 mois' });
    expect(refus({ ...FICHE, type_offre: 'emploi', contrat: 'Freelance' }).champ).toBe('contrat');
  });

  it('sait quand la durée a un sens', () => {
    expect(dureeAUnSens('stage', null)).toBe(true);
    expect(dureeAUnSens('alternance', null)).toBe(true);
    expect(dureeAUnSens('emploi', null)).toBe(false);
    expect(dureeAUnSens('emploi', 'CDI')).toBe(false);
    expect(dureeAUnSens('emploi', 'Intérim')).toBe(true);
    expect(dureeAUnSens(null, null)).toBe(false);
  });

  it('part de l’écran telle qu’elle y est, et la fiche vide est refusée', () => {
    expect(demandeDeLaFiche(FICHE_VIDE)).toMatchObject({ secteur: '', type_offre: undefined });
    expect(FicheDOffre.safeParse(demandeDeLaFiche(FICHE_VIDE)).success).toBe(false);
  });
});

describe('le département d’un code postal', () => {
  it('se déduit comme en base : deux chiffres, trois outre-mer, la Corse en deux', () => {
    expect(departementDuCodePostal('33000')).toBe('33');
    expect(departementDuCodePostal(' 01 000')).toBe('01');
    expect(departementDuCodePostal('97105')).toBe('971');
    expect(departementDuCodePostal('20000')).toBe('2A');
    expect(departementDuCodePostal('20200')).toBe('2B');
    expect(departementDuCodePostal('3300')).toBeNull();
    expect(departementDuCodePostal('')).toBeNull();
  });
});

describe('ce que la base rend', () => {
  const A_MODIFIER = {
    id: '0b7e9a52-3c1d-4f6a-9b8e-2d5f7a1c4e90',
    type_offre: 'emploi',
    intitule: 'Maçon',
    entreprise: 'Adour',
    code_postal: '40100',
    ville: 'Dax',
    contrat: 'CDD',
    duree: '8 mois',
    description: null,
    lien: null,
    contact: null,
    secteur: { code: '43', intitule: 'Travaux de construction spécialisés', niveau: 'division', section: 'F', section_intitule: 'Construction' },
    en_ligne_jusqu_au: '2026-12-27T10:00:00+00:00',
  };

  it('l’offre à modifier remplit la fiche — et rien quand la base ne la rend pas', () => {
    const lu = lireOffreAModifier(A_MODIFIER)!;
    expect(valeursDeLOffre(lu)).toMatchObject({ type_offre: 'emploi', contrat: 'CDD', description: '', secteur: { code: '43' } });
    expect(lireOffreAModifier(null)).toBeNull();
    expect(lireOffreAModifier({ id: 'x' })).toBeNull();
  });

  it('dit si l’offre est encore en ligne', () => {
    const lu = lireOffreAModifier(A_MODIFIER)!;
    expect(estEnLigne(lu, new Date('2026-11-27T10:00:00Z'))).toBe(true);
    expect(estEnLigne(lu, new Date('2026-12-28T10:00:00Z'))).toBe(false);
  });

  it('lit les offres sorties de la liste, et la page des offres avec leur type', () => {
    expect(lireOffresEchues([{ id: 'a', intitule: 'x', entreprise_nom: null, lieu_libelle: null, type_contrat_libelle: null, type_offre: 'stage', date_creation: null }])).toHaveLength(1);
    expect(lireOffresEchues({})).toBeNull();
    const page = lirePage({
      total: 1,
      offres: [{ id: 'a', intitule: 'x', entreprise_nom: null, lieu_libelle: null, type_contrat_libelle: null, type_offre: 'alternance', date_creation: null }],
    });
    expect(page?.offres[0].type_offre).toBe('alternance');
    // Une base pas encore migrée ne casse pas la liste.
    expect(lirePage({ total: 0, offres: [{ id: 'b', intitule: null, entreprise_nom: null, lieu_libelle: null, type_contrat_libelle: null }] })).not.toBeNull();
  });
});
