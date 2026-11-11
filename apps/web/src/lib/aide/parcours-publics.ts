import type { Parcours } from './parcours';

/**
 * L'aide des formulaires publics : la fiche que remplit le candidat
 * (`/candidature/<jeton>`) et la présentation que fait le parrain
 * (`/parrainage/<jeton>`).
 *
 * Ces deux écrans sont ouverts sans compte, souvent sur un téléphone, par des
 * personnes qui les voient pour la première et la dernière fois. L'aide y est
 * donc plus simple qu'en espace de travail : chaque parcours tient en une
 * étape, sur la page même, et dit ce qu'on attend dans la partie désignée.
 *
 * Ce que l'aide ne fait **pas** ici : elle n'interroge pas Claude. La route
 * du renfort exige une session, et ces pages n'en ont pas — une question
 * tapée par un candidat ne quitte jamais son navigateur.
 *
 * Les textes ne répètent aucune donnée : ils parlent du formulaire, pas de la
 * personne qui le remplit.
 */

export const CATALOGUES = ['candidature', 'parrainage'] as const;

/**
 * Le catalogue de « Mon compte » : une page connectée, mais hors de la
 * coquille des espaces — l'aide n'y trouverait aucune de ses ancres. Elle y a
 * donc les siennes, sur le même modèle : une étape, sur la page.
 */
export type Catalogue = (typeof CATALOGUES)[number] | 'compte';

/** Un parcours d'une seule étape, sans écran où aller : tout est sur la page. */
function surLaPage(
  id: string,
  titre: string,
  motsCles: readonly string[],
  ancre: string,
  texte: string,
  siAbsent?: string,
): Parcours {
  return {
    id,
    titre,
    motsCles,
    destination: null,
    etapes: [{ ancre, texte, court: COURTS[id], siAbsent }],
  };
}

/**
 * Les mêmes réponses en une phrase, pour un téléphone — la plupart des
 * candidats ouvrent leur lien depuis le leur. Elles gardent ce qui compte :
 * ce qui est obligatoire, ce qui est facultatif, et où vont les données.
 * Un test vérifie que chaque parcours public a la sienne, et qu'elle tient en
 * cent caractères.
 */
const COURTS: Record<string, string> = {
  'candidature-cv': 'Choisissez votre CV : PDF, Word ou photo, 10 Mo au plus.',
  'candidature-lecture':
    'Facultatif : ce bouton fait lire votre CV par un service extérieur pour remplir le formulaire.',
  'candidature-vous': 'Obligatoires : prénom, nom, e-mail et téléphone. Le reste est facultatif.',
  'candidature-recherche': 'Emploi, alternance ou stage ; le métier visé ; votre mobilité.',
  'candidature-permis': 'Pour chaque ligne, choisissez Oui ou Non.',
  'candidature-parcours': 'Formation, expériences, compétences : quelques lignes par case.',
  'candidature-lettre': 'Une lettre de motivation, si vous en avez une. Facultatif.',
  'candidature-donnees':
    'Lu par la commission seule, jamais publié, supprimable. Cochez pour donner votre accord.',
  'candidature-envoyer': 'Ce bouton envoie votre fiche. Un champ à corriger s’affiche en rouge.',
  'parrainage-vous': 'Vos coordonnées de parrain. Seul votre nom est obligatoire.',
  'parrainage-candidat': 'Son nom, son prénom, son e-mail, sa recherche. Il recevra son propre lien.',
  'parrainage-commission': 'Comment l’approcher, et l’urgence : 0, rien ne presse ; 5, très urgent.',
  'parrainage-donnees': 'Lu par la commission de la loge seule, jamais publié.',
  'parrainage-envoyer': 'Ce bouton envoie votre présentation. Le candidat reçoit ensuite son lien.',
  'compte-profil': 'Corrigez vos informations ici, puis enregistrez.',
  'compte-photo': 'Glissez une image sur le portrait, ou touchez-le deux fois. Elle remplace l’ancienne.',
  'compte-retirer-photo': '« Retirer » efface la photo après confirmation. Rien ne défait ce geste.',
};

const CANDIDATURE: readonly Parcours[] = [
  surLaPage(
    'candidature-cv',
    'Joindre mon CV',
    ['cv', 'joindre', 'ajouter', 'envoyer mon cv', 'fichier', 'pdf', 'word', 'photo du cv', 'format'],
    'candidature-cv',
    'Choisissez ici votre CV : un PDF, un fichier Word, ou même une photo de votre CV papier, 10 Mo au plus.',
  ),
  surLaPage(
    'candidature-lecture',
    'Remplir le formulaire à partir de mon CV',
    ['remplir', 'automatique', 'pré-remplir', 'à ma place', 'gagner du temps', 'claude', 'intelligence artificielle', 'lire mon cv'],
    'candidature-lecture',
    'Une fois votre CV choisi, ce bouton remplit le formulaire à votre place. Votre CV est alors lu par un service extérieur, comme c’est écrit juste en dessous. Vous relisez ensuite. Rien ne vous y oblige : vous pouvez tout remplir vous-même.',
    'Ce bouton n’est pas proposé pour le moment : remplissez le formulaire vous-même, votre CV sera bien joint à votre fiche.',
  ),
  surLaPage(
    'candidature-vous',
    'Remplir mes coordonnées',
    ['coordonnées', 'nom', 'prénom', 'téléphone', 'adresse', 'e-mail', 'email', 'âge', 'situation familiale', 'ville', 'obligatoire', 'astérisque'],
    'candidature-vous',
    'Vos coordonnées. Seuls les champs marqués d’un astérisque sont obligatoires : prénom, nom, e-mail et téléphone.',
  ),
  surLaPage(
    'candidature-recherche',
    'Décrire ce que je cherche',
    ['recherche', 'emploi', 'alternance', 'stage', 'métier', 'poste', 'mobilité', 'type de recherche', 'dates du stage', 'ce que je cherche'],
    'candidature-recherche',
    'Dites ce que vous cherchez : emploi, alternance ou stage, le métier visé, et jusqu’où vous pouvez vous déplacer. Plus c’est précis, mieux la commission peut vous aider.',
  ),
  surLaPage(
    'candidature-permis',
    'Dire si j’ai le permis et un véhicule',
    ['permis', 'voiture', 'véhicule', 'moto', 'conduire', 'transport'],
    'candidature-permis',
    'Pour chaque ligne — permis voiture, moto, poids lourd, véhicule — choisissez Oui ou Non dans le menu.',
  ),
  surLaPage(
    'candidature-parcours',
    'Décrire ma formation et mon expérience',
    ['parcours', 'formation', 'diplôme', 'études', 'expérience', 'compétences', 'informatique', 'savoir-être', 'centres d’intérêt', 'ancien emploi'],
    'candidature-parcours',
    'Votre formation, vos expériences, vos compétences, et ce qui vous décrit : savoir-être, centres d’intérêt. Quelques lignes par case suffisent ; votre CV complète le reste.',
  ),
  surLaPage(
    'candidature-lettre',
    'Joindre une lettre de motivation',
    ['lettre', 'lettre de motivation', 'motivation', 'autre document', 'documents'],
    'candidature-documents',
    'Vous pouvez joindre ici une lettre de motivation. Elle n’est pas obligatoire.',
  ),
  surLaPage(
    'candidature-donnees',
    'Savoir qui verra mes informations',
    ['qui verra', 'confidentiel', 'confidentialité', 'données', 'vie privée', 'supprimer', 'suppression', 'accord', 'consentement', 'case à cocher', 'rgpd'],
    'candidature-consentement',
    'Vos informations ne sont lues que par les membres de la commission, ne sont jamais publiées, et vous pouvez demander leur suppression. Cochez cette case pour donner votre accord : sans elle, la fiche ne part pas.',
  ),
  surLaPage(
    'candidature-envoyer',
    'Envoyer ma fiche',
    ['envoyer', 'valider', 'terminer', 'finir', 'soumettre', 'enregistrer', 'ça ne part pas', 'erreur'],
    'candidature-envoyer',
    'Quand tout est rempli et la case d’accord cochée, ce bouton envoie votre fiche. Si un champ pose problème, il est signalé en rouge.',
  ),
];

const PARRAINAGE: readonly Parcours[] = [
  surLaPage(
    'parrainage-vous',
    'Remplir mes coordonnées de parrain',
    ['mes coordonnées', 'mon nom', 'mon téléphone', 'ma loge', 'parrain', 'qui je suis', 'obligatoire', 'astérisque'],
    'parrainage-vous',
    'Vos coordonnées de parrain, pour que la commission puisse vous joindre. Seul votre nom est obligatoire.',
  ),
  surLaPage(
    'parrainage-candidat',
    'Présenter le candidat',
    ['candidat', 'son nom', 'son e-mail', 'son email', 'lien', 'lien de parenté', 'type de recherche', 'emploi', 'alternance', 'stage', 'la personne'],
    'parrainage-candidat',
    'Le candidat que vous présentez : son nom, son prénom, son e-mail et ce qu’il cherche. Il recevra ensuite, à cette adresse, son propre lien pour compléter sa fiche.',
  ),
  surLaPage(
    'parrainage-commission',
    'Répondre aux questions pour la commission',
    ['commission', 'appartenance', 'se dévoiler', 'dévoiler', 'urgence', 'degré d’urgence', 'urgent', 'questions', 'pourquoi'],
    'parrainage-commission',
    'Trois questions aident la commission à savoir comment approcher le candidat, et à quel point sa recherche presse : 0, rien ne presse ; 5, c’est très urgent. Dites en quelques mots pourquoi.',
  ),
  surLaPage(
    'parrainage-donnees',
    'Savoir qui verra ces informations',
    ['qui verra', 'confidentiel', 'confidentialité', 'données', 'vie privée', 'publié', 'rgpd'],
    'parrainage-confidentialite',
    'Ces informations ne sont lues que par les membres de la commission de la loge, et ne sont jamais publiées.',
  ),
  surLaPage(
    'parrainage-envoyer',
    'Envoyer la présentation',
    ['envoyer', 'valider', 'terminer', 'finir', 'présenter', 'soumettre', 'ça ne part pas', 'erreur', 'et après'],
    'parrainage-envoyer',
    'Ce bouton envoie votre présentation à la commission. Le candidat reçoit alors son lien pour compléter sa fiche.',
  ),
];

const COMPTE: readonly Parcours[] = [
  surLaPage(
    'compte-profil',
    'Changer mon nom, mon téléphone ou ma présentation',
    ['nom', 'prénom', 'téléphone', 'ville', 'code postal', 'présentation', 'coordonnées', 'mes informations', 'modifier mon profil'],
    'compte-profil',
    'Corrigez ici votre prénom, votre nom, votre téléphone, votre ville ou votre présentation, puis enregistrez.',
  ),
  surLaPage(
    'compte-photo',
    'Mettre ou changer ma photo',
    ['photo', 'portrait', 'visage', 'image', 'changer ma photo', 'ajouter une photo', 'déposer'],
    'portrait',
    'Glissez une image sur votre portrait, ou double-cliquez dedans pour la choisir. Une nouvelle photo remplace l’ancienne : inutile de retirer d’abord.',
    'Votre compte n’est rattaché à aucune fiche de référent : il n’y a pas de portrait où déposer une photo.',
  ),
  surLaPage(
    'compte-retirer-photo',
    'Retirer ma photo',
    ['retirer ma photo', 'supprimer ma photo', 'enlever ma photo', 'effacer ma photo', 'plus de photo', 'sans photo'],
    'retirer-photo',
    '« Retirer », sous votre portrait, ouvre une fenêtre de confirmation. Le fichier est alors effacé et votre fiche n’a plus de visage : rien ne défait ce geste. Pour changer de photo sans la perdre, déposez-en simplement une autre.',
    'Pas de bouton « Retirer » : votre fiche n’a pas de photo en ce moment.',
  ),
];

const PAR_CATALOGUE: Record<Catalogue, readonly Parcours[]> = {
  candidature: CANDIDATURE,
  parrainage: PARRAINAGE,
  compte: COMPTE,
};

/** L'exemple montré dans le champ de question, pour dire quoi demander. */
export const EXEMPLES: Record<Catalogue, string> = {
  candidature: 'comment joindre mon CV',
  parrainage: 'que veut dire le degré d’urgence',
  compte: 'comment changer ma photo',
};

export function parcoursDuCatalogue(catalogue: Catalogue): readonly Parcours[] {
  return PAR_CATALOGUE[catalogue];
}
