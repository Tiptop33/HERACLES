import type { DonneesAffiche } from './affiche';
import type { DonneesAffichette } from './affichette';
import type { DonneesCompteRendu } from './compte-rendu';
import type { DonneesCvAnonyme } from './cv-anonyme';
import type { Commission } from './formats';

/**
 * Des données d'exemple pour l'aperçu de Paramètres › Mise en page.
 *
 * Toutes inventées. L'aperçu sert à juger une mise en page — une taille, une
 * couleur, une marge —, pas à relire des dossiers : il n'a besoin d'aucune
 * donnée réelle, et n'en montre aucune (règle 4 du projet).
 *
 * Les longueurs, elles, sont celles de la vie : des intitulés qui passent à la
 * ligne, des commentaires de deux lignes, assez de présences pour remplir la
 * page. Une mise en page qui tient sur l'exemple tient sur les vrais documents.
 */

const COMMISSION: Commission = {
  loge_nom: 'HERACLES',
  venerable_prenom: 'Prénom',
  venerable_nom: 'NOM',
  venerable_telephone: '0600000001',
  venerable_email: 'president@exemple.org',
  secretaire_prenom: 'Prénom',
  secretaire_nom: 'NOM',
  secretaire_telephone: '0600000002',
  secretaire_email: 'secretariat@exemple.org',
};

/** Un mercredi, le 4e d'octobre 2026. */
const REUNION = '2026-10-28';

const NOMS = [
  ['ARNAUD', 'Basile'],
  ['BERNARD', 'Céline'],
  ['CHARPENTIER', 'Damien'],
  ['DELACROIX', 'Élodie'],
  ['FONTAINE', 'Gaspard'],
  ['GIRAUD', 'Hélène'],
  ['HUBERT', 'Isidore'],
  ['JOUBERT', 'Karine'],
  ['LAMBERT', 'Lucien'],
  ['MARCHAND', 'Noémie'],
  ['NOËL', 'Octave'],
  ['PERRIN', 'Pauline'],
] as const;

const ETATS = ['Présent', 'Présent', 'Absent', 'Présent', 'Excusé', 'Présent', 'Présent', 'Absent', 'Présent', 'Présent', 'Présent', 'Excusé'];

export function exempleDeCompteRendu(): DonneesCompteRendu {
  return {
    tenueLe: REUNION,
    presences: NOMS.map(([nom, prenom], i) => {
      const presences = ETATS[i] === 'Présent' ? 3 - (i % 2) : i % 2;
      return {
        nom,
        prenom,
        email: `${prenom.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')}.${nom.toLowerCase()}@exemple.org`,
        telephone: `06000000${String(10 + i)}`,
        etat: ETATS[i],
        presences,
        taux: Math.round((100 * presences) / 3),
      };
    }),
    candidats: [
      {
        numero: 901,
        ouvert_le: '2025-11-27',
        definition_emploi: 'Assistanat de direction dans une PME du bâtiment',
        emploi_recherche: 'ASSISTANTE DE DIRECTION',
        metier_libelle: null,
        nom: 'AUBRY',
        prenom: 'Alice',
        referent_nom: 'ARNAUD',
        commentaire: 'Doit se mettre en contact avec le réseau des notaires.',
      },
      {
        numero: 902,
        ouvert_le: '2026-04-17',
        definition_emploi: 'Responsable commercial grands comptes',
        emploi_recherche: 'RESPONSABLE COMMERCIAL RÉGIONAL B to C',
        metier_libelle: null,
        nom: 'BOISSIER',
        prenom: 'Bruno',
        referent_nom: 'BERNARD',
        commentaire: 'Attente du deuxième entretien.',
      },
      {
        numero: 903,
        ouvert_le: '2026-07-24',
        definition_emploi: null,
        emploi_recherche: 'Stage de fin d’études de seize semaines, BTS mesures physiques',
        metier_libelle: null,
        nom: 'COUDERC',
        prenom: 'Chloé',
        referent_nom: 'GIRAUD',
        commentaire: 'Suite à la réunion, lui indiquer les sites de l’État pour l’alternance.',
      },
      {
        numero: 904,
        ouvert_le: '2026-10-14',
        definition_emploi: 'Directeur commercial B2B, développement de réseaux',
        emploi_recherche: 'Direction commerciale B2B et B2C, pilotage des ventes et management d’équipe',
        metier_libelle: null,
        nom: 'DUFAUR',
        prenom: 'Denis',
        referent_nom: null,
        commentaire: null,
      },
    ],
    offres: [{ ajoutee_le: '2026-05-25', poste: null, societe: 'SAS EXEMPLE ARCHITECTES', ville: null, contact: null, email: null }],
    commission: { ...COMMISSION, lieu_reunions: 'Lieu des réunions à 11H30', nombre_dossiers: 904, prochaine_reunion: null },
  };
}

export function exempleDAffiche(racine: string): DonneesAffiche {
  const cr = exempleDeCompteRendu();
  return {
    tenueLe: '2026-10-14',
    dossiers: cr.candidats.map((c, i) => ({
      numero: c.numero,
      ouvert_le: c.ouvert_le,
      intitule: c.emploi_recherche,
      lienCvAnonyme: i % 3 === 2 ? null : `${racine}/cv-anonyme/00000000-0000-4000-8000-00000000000${i}`,
    })),
    offres: cr.offres,
    commission: COMMISSION,
  };
}

export function exempleDAffichette(racine: string): DonneesAffichette {
  return {
    numero: 904,
    type_emploi: 'Emploi',
    emploi_recherche: 'DIRECTEUR DES OPÉRATIONS, SECTEUR BÂTIMENT SECOND ŒUVRE',
    metier_libelle: null,
    mobilite_geographique: 'Agglomération',
    commission: COMMISSION,
    lienCvAnonyme: `${racine}/cv-anonyme/00000000-0000-4000-8000-000000000000`,
  };
}

/**
 * Le dossier 904 de la planche des maquettes, dans les champs de la fiche : le
 * plus chargé des trois exemples, pour juger si une mise en page tient.
 */
export function exempleDeCvAnonyme(): DonneesCvAnonyme {
  return {
    numero: 904,
    type_emploi: 'emploi',
    emploi_recherche: 'Directeur des opérations, second œuvre du bâtiment',
    secteur_activite_libelle: 'Bâtiment et travaux publics',
    metier_libelle: 'Direction de travaux',
    debut_stage: null,
    mobilite_geographique: 'Agglomération et départements limitrophes',
    permis_vl: 'Oui',
    vehicule: 'Oui',
    experiences: [
      '2019-2025 — Directeur de travaux, entreprise générale de second œuvre (85 salariés) : pilotage de douze chantiers simultanés, budget annuel de 9 M€, encadrement de six conducteurs de travaux',
      '2012-2019 — Conducteur de travaux principal, groupe national de construction : réhabilitation de logements en site occupé, relation avec la maîtrise d’ouvrage et les bailleurs',
      '2007-2012 — Conducteur de travaux, PME de plâtrerie et d’isolation : chiffrage, plannings, consultation des sous-traitants',
      '2004-2007 — Chef d’équipe, entreprise de menuiserie intérieure : pose, réception des ouvrages, formation des apprentis',
    ].join('\n'),
    formations: [
      '2020 — Certificat de sauveteur secouriste du travail et habilitation électrique',
      '2011 — Licence professionnelle Management de chantier, IUT',
      '2004 — BTS Bâtiment, lycée professionnel',
    ].join('\n'),
    competences: [
      'Pilotage de chantiers tous corps d’état',
      'Chiffrage et suivi budgétaire',
      'Management d’équipes pluridisciplinaires',
      'Négociation avec fournisseurs et sous-traitants',
      'Réglementation RE2020 et sécurité',
      'Anglais professionnel',
    ].join('\n'),
    savoir_etre: 'Rigueur\nSens de l’écoute\nCalme sous pression\nEsprit d’équipe',
    informatique: 'MS Project\nExcel avancé\nAutoCAD (lecture de plans)\nLogiciel de devis',
    a_jour_le: '2026-11-04',
    contact_par_defaut: COMMISSION.secretaire_email,
  };
}
