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
 *
 * Celui de la page du candidat (`/espace/chercheur`, migration 0105) suit le
 * même modèle, pour les mêmes raisons : la page a sa propre barre, sans la
 * colonne des référents, et tout s'y fait sur un seul écran. Pas de Claude
 * non plus : une question tapée par un candidat ne quitte pas son navigateur.
 */
export type Catalogue = (typeof CATALOGUES)[number] | 'compte' | 'candidat';

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
  'candidat-offres': 'Les offres de vos secteurs. Touchez-en une pour la lire en entier.',
  'candidat-departements': 'Touchez un département pour l’ajouter ou le retirer. Votre choix est gardé.',
  'candidat-secteurs': 'Vos secteurs décident de vos offres. Votre référent confirme ceux que vous ajoutez.',
  'candidat-jauge': 'La jauge dit ce qui manque : touchez un mot pour aller au champ.',
  'candidat-fiche': 'Un champ corrigé s’enregistre dès que vous le quittez. L’e-mail se change par le référent.',
  'candidat-photo': 'JPEG, PNG ou WebP, 2 Mo au plus. « Retirer ma photo » l’efface aussitôt.',
  'candidat-messages': 'Lu par votre référent et votre parrain seuls. Corrigeable 24 heures, puis gardé.',
  'candidat-documents': 'Glissez ou choisissez le fichier : 10 Mo au plus, cinq CV et cinq lettres.',
  'candidat-supprimer-document': '« Supprimer » demande confirmation, puis efface pour de bon.',
  'candidat-referent': 'Votre référent est nommé ici. Pour lui écrire : « Où j’en suis ».',
  'candidat-donnees': 'Lu par la commission seule, jamais publié. Seul votre CV anonyme, sans nom, circule.',
  'candidat-deconnexion': 'Pour revenir : « Recevoir un lien de connexion », par courriel. Pas de mot de passe.',
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

/**
 * La page du candidat. Les textes parlent de la page, jamais de la personne :
 * ni son nom, ni celui de son référent — le personnage désigne la ligne qui le
 * porte. Chaque réponse qui touche à ses données dit qui les lit.
 */
const CANDIDAT: readonly Parcours[] = [
  surLaPage(
    'candidat-offres',
    'Voir les offres pour moi',
    ['offre', 'offres', 'offres pour moi', 'emploi', 'annonce', 'annonces', 'nouvelle offre', 'nouvelles offres', 'france travail', 'chercher une offre', 'lire une offre', 'postuler'],
    'candidat-offres',
    '« Offres pour moi » : les offres France Travail en cours dans vos secteurs d’activité, mises à jour toutes les trois heures. « Nouvelle » marque celles parues depuis votre dernière visite. Touchez une offre pour la lire en entier, ou cherchez un mot dans le champ de recherche.',
  ),
  surLaPage(
    'candidat-departements',
    'Choisir les départements de mes offres',
    ['département', 'départements', 'changer de département', 'autre département', 'près de chez moi', 'plus loin', 'lieu des offres', 'région'],
    'candidat-departements',
    'Touchez un département pour l’ajouter ou le retirer : la liste des offres suit, et votre choix est gardé pour la prochaine fois. Aucun département choisi : vous les voyez tous.',
    'La liste des offres n’a pas pu être lue. Réessayez dans un instant.',
  ),
  surLaPage(
    'candidat-secteurs',
    'Choisir mes secteurs d’activité',
    ['secteur', 'secteurs', 'secteur d’activité', 'secteurs d’activité', 'domaine', 'modifier mes secteurs', 'aucune offre', 'pas d’offres', 'pas assez d’offres'],
    'candidat-secteurs',
    'Vos secteurs d’activité décident des offres que vous voyez. Un secteur ajouté sert tout de suite à vos offres ; votre référent le confirme ensuite.',
    'Dépliez « Ma recherche », dans « Ma fiche ».',
  ),
  surLaPage(
    'candidat-jauge',
    'Compléter ma fiche : ce qui manque',
    ['jauge', 'pourcentage', 'remplie', 'à compléter', 'compléter ma fiche', 'ce qui manque à ma fiche', 'ma fiche est incomplète', 'fiche incomplète'],
    'candidat-jauge',
    'Cette jauge dit combien votre fiche est remplie. Sous « À compléter », chaque mot vous mène au champ qui manque.',
  ),
  surLaPage(
    'candidat-fiche',
    'Corriger ma fiche',
    ['ma fiche', 'modifier', 'corriger', 'changer', 'mettre à jour', 'téléphone', 'adresse', 'adresse e-mail', 'mes informations', 'enregistrer', 'sauvegarder', 'valider'],
    'candidat-fiche',
    'Dans « Ma fiche », dépliez une partie et corrigez un champ : il est enregistré dès que vous le quittez, sans bouton. Votre référent et votre parrain voient votre fiche à jour. Votre adresse e-mail sert à vous connecter : pour en changer, demandez à votre référent.',
  ),
  surLaPage(
    'candidat-photo',
    'Mettre, changer ou retirer ma photo',
    ['photo', 'ma photo', 'portrait', 'image', 'changer de photo', 'changer ma photo', 'retirer ma photo', 'supprimer ma photo'],
    'candidat-photo',
    '« Choisir une photo », ou « Changer de photo » : JPEG, PNG ou WebP, 2 Mo au plus. Votre référent et votre parrain la voient sur votre fiche. « Retirer ma photo » l’efface tout de suite, sans fenêtre de confirmation.',
  ),
  surLaPage(
    'candidat-messages',
    'Dire à mon référent où j’en suis',
    ['message', 'messages', 'écrire', 'écrire à mon référent', 'écrire à mon parrain', 'donner des nouvelles', 'entretien', 'prévenir', 'contacter', 'corriger un message', 'modifier un message'],
    'candidat-messages',
    '« Où j’en suis » : écrivez où en est votre recherche — une candidature, un entretien, une réponse —, puis « Envoyer ». Votre référent et votre parrain le lisent, eux seuls ; votre référent est prévenu par courriel, sans le texte. Un message se corrige pendant 24 heures, puis il est gardé tel quel.',
  ),
  surLaPage(
    'candidat-documents',
    'Ajouter un CV ou une lettre de motivation',
    ['cv', 'mon cv', 'lettre', 'lettre de motivation', 'document', 'documents', 'déposer', 'ajouter', 'joindre', 'fichier', 'principal', 'document principal', 'renommer'],
    'candidat-documents',
    'Choisissez votre fichier, ou glissez-le sur « Ajouter un CV » ou « Ajouter une lettre » : PDF, Word, OpenDocument, RTF ou image, 10 Mo au plus, cinq de chaque. Le principal est celui que votre référent ouvre en premier ; il voit aussi tous les autres.',
  ),
  surLaPage(
    'candidat-supprimer-document',
    'Supprimer un document',
    ['supprimer', 'supprimer un document', 'supprimer un cv', 'supprimer une lettre', 'effacer', 'retirer un document', 'ancien cv'],
    'candidat-supprimer-document',
    '« Supprimer », sur la ligne du document, demande confirmation. Le document est alors effacé pour de bon : il ne pourra pas être récupéré. Si c’était le principal, le plus récent prend sa place.',
    'Vous n’avez encore déposé aucun document.',
  ),
  surLaPage(
    'candidat-referent',
    'Savoir qui suit ma recherche',
    // « qui est mon référent » se réduit à « mon référent » : une seule clé,
    // sans quoi elle compterait deux fois face à « écrire à mon référent ».
    ['mon référent', 'qui me suit', 'accompagnement', 'pas de référent', 'mon parrain'],
    'candidat-referent',
    'Votre référent est nommé ici : c’est lui qui suit votre recherche. Pour lui écrire, utilisez « Où j’en suis ». Pas encore de nom : un référent va prendre votre dossier en charge.',
  ),
  surLaPage(
    'candidat-donnees',
    'Savoir qui voit mes informations',
    ['qui voit', 'qui voit mes informations', 'qui verra', 'confidentiel', 'confidentialité', 'données', 'vie privée', 'rgpd', 'publié', 'cv anonyme', 'anonyme', 'suppression de mes données'],
    'candidat-fiche',
    'Votre fiche et vos documents ne sont lus que par la commission de votre loge, et ne sont jamais publiés ; vos messages, par votre référent et votre parrain seuls. Ce qui circule, c’est votre CV anonyme : ni nom, ni photo, ni coordonnées. Vous pouvez demander la suppression de vos informations.',
  ),
  surLaPage(
    'candidat-deconnexion',
    'Me déconnecter, me reconnecter',
    ['déconnecter', 'déconnexion', 'quitter', 'me reconnecter', 'revenir', 'se connecter', 'connexion', 'mot de passe', 'lien de connexion'],
    'candidat-deconnexion',
    '« Se déconnecter » ferme votre session. Pour revenir, choisissez « Recevoir un lien de connexion » sur l’écran de connexion : le lien arrive par courriel. Il n’y a pas de mot de passe.',
  ),
];

const PAR_CATALOGUE: Record<Catalogue, readonly Parcours[]> = {
  candidature: CANDIDATURE,
  parrainage: PARRAINAGE,
  compte: COMPTE,
  candidat: CANDIDAT,
};

/** L'exemple montré dans le champ de question, pour dire quoi demander. */
export const EXEMPLES: Record<Catalogue, string> = {
  candidature: 'comment joindre mon CV',
  parrainage: 'que veut dire le degré d’urgence',
  compte: 'comment changer ma photo',
  candidat: 'comment écrire à mon référent',
};

export function parcoursDuCatalogue(catalogue: Catalogue): readonly Parcours[] {
  return PAR_CATALOGUE[catalogue];
}
