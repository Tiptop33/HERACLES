import { describe, expect, it } from 'vitest';
import {
  FenetreNouveauCandidat,
  FormulaireCandidature,
  FormulaireParrain,
  InvitationParrain,
  TYPES_DE_RECHERCHE,
  cheminDuDocument,
  courrielAuCandidat,
  courrielAuCandidatSansParrain,
  courrielAuParrain,
  courrielDeRelance,
  estUnStage,
  libelleDeRecherche,
  lienDuCandidat,
  lienDuParrain,
  premiereErreur,
} from '../src/lib/parrainage';

const parrain = {
  parrain_nom: 'Dupont',
  parrain_prenom: 'Jean',
  parrain_telephone: '',
  parrain_loge: '',
  lien_parente: 'son neveu',
  connait_appartenance: 'Non',
  peut_se_devoiler: 'Oui',
  urgence: '4',
  urgence_motif: '',
  candidat_nom: 'Martin',
  candidat_prenom: 'Lucie',
  candidat_email: 'lucie@example.org',
  type_emploi: 'stage en alternance',
};

const candidature = {
  prenom: 'Lucie',
  nom: 'Martin',
  email: 'lucie@example.org',
  telephone: '0700000000',
  age: '22',
  situation_familiale: 'la fille',
  adresse: '1 rue des Écoles',
  code_postal: '64000',
  ville: 'Pau',
  type_emploi: 'stage en alternance',
  emploi_recherche: 'Comptable',
  definition_emploi: 'Alternance en cabinet comptable',
  mobilite_geographique: 'Départementale',
  debut_stage: '2027-01-04',
  fin_stage: '2027-06-30',
  permis_vl: 'Oui',
  permis_moto: 'Non',
  permis_pl: 'Non',
  vehicule: 'Oui',
  formations: 'BTS CG',
  experiences: 'Stage de deux mois',
  competences: 'Sage, Excel',
  informatique: '',
  savoir_etre: '',
  centres_interet: 'Rugby',
  consentement: 'oui',
};

describe('les listes de choix de Bubble', () => {
  it('gardent les valeurs que la base sait ranger', () => {
    // Ces quatre valeurs sont celles de `types_de_recherche()` (0057) et de
    // `famille_de_recherche()` (0032) : un écart ici ferait refuser la saisie.
    expect(TYPES_DE_RECHERCHE.map((t) => t.valeur)).toEqual([
      'emploi',
      "changement d'Emploi",
      'stage en alternance',
      'stage',
    ]);
  });

  it('affichent un libellé lisible, et laissent passer l’inconnu', () => {
    expect(libelleDeRecherche("changement d'Emploi")).toBe('Changement d’emploi');
    expect(libelleDeRecherche('Alternance')).toBe('Alternance');
    expect(libelleDeRecherche(null)).toBeNull();
  });

  it('reconnaissent un stage, alternance comprise', () => {
    expect(estUnStage('stage')).toBe(true);
    expect(estUnStage('stage en alternance')).toBe(true);
    expect(estUnStage('emploi')).toBe(false);
    expect(estUnStage('')).toBe(false);
  });
});

describe('l’invitation du parrain', () => {
  it('exige une adresse valable', () => {
    expect(InvitationParrain.safeParse({ email: 'parrain@example.org' }).success).toBe(true);
    expect(InvitationParrain.safeParse({ email: 'pas-une-adresse' }).success).toBe(false);
  });
});

describe('le formulaire du parrain', () => {
  it('accepte une présentation complète, urgence lue comme un nombre', () => {
    const lu = FormulaireParrain.safeParse(parrain);
    expect(lu.success).toBe(true);
    if (lu.success) {
      expect(lu.data.urgence).toBe(4);
      // Les champs vides deviennent absents, pas des chaînes vides.
      expect(lu.data.parrain_telephone).toBeUndefined();
    }
  });

  it('ne lit pas une urgence vide comme un zéro', () => {
    const lu = FormulaireParrain.safeParse({ ...parrain, urgence: '' });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('urgence');
  });

  it('borne l’urgence de 0 à 5', () => {
    expect(FormulaireParrain.safeParse({ ...parrain, urgence: '0' }).success).toBe(true);
    expect(FormulaireParrain.safeParse({ ...parrain, urgence: '6' }).success).toBe(false);
    expect(FormulaireParrain.safeParse({ ...parrain, urgence: '2.5' }).success).toBe(false);
  });

  it('refuse un type de recherche inventé', () => {
    expect(FormulaireParrain.safeParse({ ...parrain, type_emploi: 'CDI' }).success).toBe(false);
  });

  it('accepte un téléphone français, quelle que soit sa présentation', () => {
    for (const numero of ['06 12 34 56 78', '0612345678', '01.23.45.67.89', '+33 6 12 34 56 78']) {
      expect(FormulaireParrain.safeParse({ ...parrain, parrain_telephone: numero }).success).toBe(
        true,
      );
    }
  });

  it('refuse un téléphone hors numérotation française', () => {
    for (const numero of ['123', '00 12 34 56 78', '06 12 34 56']) {
      const lu = FormulaireParrain.safeParse({ ...parrain, parrain_telephone: numero });
      expect(lu.success).toBe(false);
      if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('parrain_telephone');
    }
  });

  it('exige les réponses Oui / Non, et rien d’autre', () => {
    expect(FormulaireParrain.safeParse({ ...parrain, peut_se_devoiler: '' }).success).toBe(false);
    expect(FormulaireParrain.safeParse({ ...parrain, peut_se_devoiler: 'Peut-être' }).success).toBe(
      false,
    );
  });

  it('dit quel champ manque, et jamais « Invalid input »', () => {
    const { candidat_email: _oublie, ...sansAdresse } = parrain;
    void _oublie;
    const lu = FormulaireParrain.safeParse(sansAdresse);
    expect(lu.success).toBe(false);
    if (!lu.success) {
      const erreur = premiereErreur(lu.error);
      expect(erreur.champ).toBe('candidat_email');
      expect(erreur.message).not.toMatch(/^Invalid/);
    }
  });
});

describe('le formulaire du candidat', () => {
  it('accepte une fiche complète', () => {
    const lu = FormulaireCandidature.safeParse(candidature);
    expect(lu.success).toBe(true);
    if (lu.success) expect(lu.data.age).toBe(22);
  });

  it('exige le consentement', () => {
    const lu = FormulaireCandidature.safeParse({ ...candidature, consentement: '' });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('consentement');
  });

  it('borne l’âge, et ne lit pas une case vide comme zéro', () => {
    expect(FormulaireCandidature.safeParse({ ...candidature, age: '7' }).success).toBe(false);
    expect(FormulaireCandidature.safeParse({ ...candidature, age: '' }).success).toBe(false);
  });

  it('refuse un stage qui finit avant de commencer', () => {
    const lu = FormulaireCandidature.safeParse({
      ...candidature,
      debut_stage: '2027-06-30',
      fin_stage: '2027-01-04',
    });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('fin_stage');
  });

  it('garde la liste de situations de Bubble', () => {
    expect(
      FormulaireCandidature.safeParse({ ...candidature, situation_familiale: 'Célibataire' })
        .success,
    ).toBe(false);
  });
});

describe('les chemins et les liens', () => {
  it('rangent le CV là où la base l’attend', () => {
    expect(cheminDuDocument('cv', 'abc', 'pdf')).toBe('candidat/cv/abc.pdf');
    expect(cheminDuDocument('lettre', 'abc', 'docx')).toBe('candidat/lettre/abc.docx');
  });

  it('bâtissent les liens sur l’adresse publique, sans double barre', () => {
    expect(lienDuParrain('https://heracles.example.fr/', 'J')).toBe(
      'https://heracles.example.fr/parrainage/J',
    );
    expect(lienDuCandidat('https://heracles.example.fr', 'J')).toBe(
      'https://heracles.example.fr/candidature/J',
    );
  });
});

describe('les courriels', () => {
  const lien = 'https://heracles.example.fr/parrainage/J';

  it('reprennent le modèle de la commission, et y ajoutent le lien', () => {
    const message = courrielAuParrain(
      { objet_parrain: 'Objet de la commission', mot_parrain: 'Texte de la commission' },
      lien,
      'Pau',
      'Paul P',
    );
    expect(message.sujet).toBe('Objet de la commission');
    expect(message.texte.startsWith('Texte de la commission')).toBe(true);
    expect(message.texte).toContain(lien);
    expect(message.texte).toContain('Commission HERACLES — Pau');
  });

  it('ont un texte par défaut quand le modèle est vide', () => {
    const message = courrielAuParrain({ mot_parrain: '   ' }, lien, null, null);
    expect(message.texte).toContain('présenter');
    expect(message.texte).toContain(lien);
  });

  it('gardent l’objet de Bubble pour le candidat', () => {
    expect(courrielAuCandidat({}, lien, 'Pau', 'Lucie').sujet).toBe('DEMANDE DE RENSEIGNEMENTS');
  });

  it('annoncent la relance comme un rappel', () => {
    expect(courrielDeRelance({}, lien, 'Pau', null).sujet).toMatch(/^Rappel/);
  });
});

describe('InvitationParrain — l’une ou l’autre adresse (0059, 0060)', () => {
  it('accepte le parrain seul : la page n’en demande qu’une', () => {
    const lu = InvitationParrain.safeParse({ email: 'parrain@example.org' });
    expect(lu.success).toBe(true);
    expect(lu.success && lu.data.candidat_email).toBeUndefined();
  });

  it('accepte le candidat seul, la case du parrain vide', () => {
    const lu = InvitationParrain.safeParse({ email: '  ', candidat_email: 'candidat@example.org' });
    expect(lu.success).toBe(true);
    expect(lu.success && lu.data.email).toBeUndefined();
  });

  it('accepte les deux, distinctes', () => {
    const lu = FenetreNouveauCandidat.safeParse({
      email: 'parrain@example.org',
      candidat_email: 'candidat@example.org',
    });
    expect(lu.success).toBe(true);
  });

  it('refuse deux cases vides, en le disant en français', () => {
    const lu = FenetreNouveauCandidat.safeParse({ email: '', candidat_email: ' ' });
    expect(lu.success).toBe(false);
    if (!lu.success) {
      expect(premiereErreur(lu.error)).toEqual({
        champ: 'candidat_email',
        message: 'Indiquez au moins une adresse : celle du candidat ou celle du parrain.',
      });
    }
  });

  it('refuse une adresse mal formée, d’un côté comme de l’autre', () => {
    expect(InvitationParrain.safeParse({ email: 'parrain@example.org', candidat_email: 'non' }).success).toBe(false);
    expect(InvitationParrain.safeParse({ email: 'non', candidat_email: 'c@example.org' }).success).toBe(false);
  });

  it('refuse la même adresse pour le candidat et le parrain', () => {
    const lu = FenetreNouveauCandidat.safeParse({
      email: 'Meme@Example.org',
      candidat_email: 'meme@example.org',
    });
    expect(lu.success).toBe(false);
    if (!lu.success) expect(premiereErreur(lu.error).champ).toBe('email');
  });
});

describe('courrielAuCandidatSansParrain', () => {
  it('ne parle pas de parrain, et finit par le lien et la signature', () => {
    const m = courrielAuCandidatSansParrain({}, 'https://x.test/candidature/abc', 'Loge A', 'Jeanne R');
    expect(m.texte).not.toMatch(/parrain/i);
    expect(m.texte).toContain('https://x.test/candidature/abc');
    expect(m.texte).toMatch(/Jeanne R\nCommission HERACLES — Loge A$/);
  });
});
