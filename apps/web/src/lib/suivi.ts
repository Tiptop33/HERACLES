/**
 * Les deux indicateurs que la maquette affiche et que la base ne stocke pas :
 * l'état du suivi, et la part de la fiche qui est renseignée.
 *
 * Ils se calculent ici, en dehors de toute page, pour être éprouvés
 * directement — et pour que la règle soit lisible en un seul endroit le jour
 * où elle changera.
 */

export type EtatSuivi = 'suivi' | 'attente' | 'clos';

export type Suivi = {
  etat: EtatSuivi;
  libelle: string;
};

type PourEtat = {
  cloture?: string | null;
  archive?: string | null;
  cree_le?: string | null;
  maj_le?: string | null;
};

/** Une chaîne qui ne contient que des blancs ne renseigne rien. */
function rempli(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined) return false;
  if (typeof valeur === 'string') return valeur.trim() !== '';
  return true;
}

/**
 * Deux dates séparées de moins d'une seconde : la fiche n'a pas été retouchée
 * depuis sa création. La tolérance existe parce que `cree_le` et `maj_le` sont
 * posées par deux écritures distinctes lors de la reprise depuis Bubble.
 */
function jamaisRetouchee(cree: string | null | undefined, maj: string | null | undefined): boolean {
  if (!cree || !maj) return false;

  const debut = Date.parse(cree);
  const dernier = Date.parse(maj);
  if (Number.isNaN(debut) || Number.isNaN(dernier)) return false;

  return dernier - debut < 1000;
}

/**
 * L'état d'un candidat, dans cet ordre :
 *
 *   1. clôturé ou archivé → **Clôturé**, suivi de la raison quand elle est
 *      donnée (« Clôturé — embauché ») ;
 *   2. jamais retouchée depuis sa création → **À contacter** : personne ne s'en
 *      est encore occupé ;
 *   3. sinon → **Suivi**.
 */
export function etatDuSuivi(candidat: PourEtat): Suivi {
  const raison = [candidat.cloture, candidat.archive].find(rempli);

  if (rempli(raison)) {
    const detail = String(raison).trim();
    // « Clôturé » suffit quand la raison ne fait que répéter le mot.
    const repete = /^cl[oô]tur/i.test(detail);
    return {
      etat: 'clos',
      libelle: repete ? 'Clôturé' : `Clôturé — ${detail.toLowerCase()}`,
    };
  }

  if (jamaisRetouchee(candidat.cree_le, candidat.maj_le)) {
    return { etat: 'attente', libelle: 'À contacter' };
  }

  return { etat: 'suivi', libelle: 'Suivi' };
}

/**
 * Les vingt champs qui font une fiche utile à un référent. Vingt, et non les
 * cinquante de la table : les colonnes techniques reprises de Bubble
 * (`bubble_id`, identifiants de nomenclatures pas encore raccordées) ne disent
 * rien du travail d'accompagnement.
 */
export const CHAMPS_COMPTES = [
  'nom',
  'prenom',
  'telephone',
  'email',
  'age',
  'adresse_ou_ville',
  'type_emploi',
  'emploi_recherche',
  'mobilite_geographique',
  'secteur_activite_libelle',
  'debut_stage',
  'formations',
  'experiences',
  'competences',
  'savoir_etre',
  'informatique',
  'permis_vl',
  'cv',
  'lettre_motivation',
  'cv_anonyme',
] as const;

type PourRemplissage = {
  nom?: string | null;
  prenom?: string | null;
  telephone?: string | null;
  email?: string | null;
  age?: number | null;
  ville?: string | null;
  adresse?: string | null;
  type_emploi?: string | null;
  emploi_recherche?: string | null;
  mobilite_geographique?: string | null;
  secteur_activite_libelle?: string | null;
  debut_stage?: string | null;
  formations?: string | null;
  experiences?: string | null;
  competences?: string | null;
  savoir_etre?: string | null;
  informatique?: string | null;
  permis_vl?: string | null;
  cv_url?: string | null;
  cv_chemin?: string | null;
  lettre_motivation_url?: string | null;
  lettre_motivation_chemin?: string | null;
  cv_anonyme_url?: string | null;
  cv_anonyme_chemin?: string | null;
};

/**
 * La part de ces vingt champs qui est renseignée, en pourcentage entier.
 * L'adresse compte pour un : la ville saisie ici ou l'adresse reprise de
 * Bubble, l'une vaut l'autre. Un document compte dès qu'on sait où il est —
 * chez nous ou, en attendant la bascule, encore chez Bubble.
 */
export function tauxDeRemplissage(candidat: PourRemplissage): number {
  const valeurs = [
    candidat.nom,
    candidat.prenom,
    candidat.telephone,
    candidat.email,
    candidat.age,
    candidat.ville ?? candidat.adresse,
    candidat.type_emploi,
    candidat.emploi_recherche,
    candidat.mobilite_geographique,
    candidat.secteur_activite_libelle,
    candidat.debut_stage,
    candidat.formations,
    candidat.experiences,
    candidat.competences,
    candidat.savoir_etre,
    candidat.informatique,
    candidat.permis_vl,
    candidat.cv_chemin ?? candidat.cv_url,
    candidat.lettre_motivation_chemin ?? candidat.lettre_motivation_url,
    candidat.cv_anonyme_chemin ?? candidat.cv_anonyme_url,
  ];

  const comptes = valeurs.filter(rempli).length;
  return Math.round((comptes / CHAMPS_COMPTES.length) * 100);
}
