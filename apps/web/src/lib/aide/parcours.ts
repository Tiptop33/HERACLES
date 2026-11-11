import type { Role } from '../roles';

/**
 * Le catalogue de l'aide : ce que l'application sait expliquer.
 *
 * Un **parcours** répond à une question (« comment avoir la liste de mes
 * candidats ? ») par une suite d'**étapes**. Chaque étape désigne un élément
 * de l'écran par son **ancre** — l'attribut `data-aide` posé sur cet élément —
 * et dit une phrase. Le personnage vient se placer à côté.
 *
 * Trois formes d'ancre :
 * - `menu:<adresse>` — une entrée de la colonne de gauche ;
 * - `vue:<valeur>` / `onglet:<valeur>` — une pastille du volet des candidats,
 *   un onglet de la fiche ;
 * - `rubrique:<adresse>` — une rubrique du menu des paramètres ;
 * - un nom libre (`recherche-candidats`) — un élément marqué à la main.
 *
 * Tout ce fichier est du texte et des adresses : aucune donnée de personne n'y
 * entre, et rien n'en sort — la recherche se fait dans le navigateur.
 *
 * `tests/aide.test.ts` vérifie que chaque ancre citée ici existe dans le code.
 * Un écran refondu sans son ancre ferait pointer le personnage dans le vide :
 * le test casse avant.
 */

export type Etape = {
  /** L'élément désigné, ou `null` pour une phrase sans cible. */
  ancre: string | null;
  /** Ce que dit le personnage. */
  texte: string;
  /**
   * La même chose en une phrase, pour un téléphone : la bulle y prend vite
   * tout l'écran, et recouvre ce qu'elle explique. Absent : `texte` sert.
   */
  court?: string;
  /**
   * L'adresse de l'écran qui porte l'élément. Quand l'élément n'est pas à
   * l'écran, l'aide propose d'y aller.
   */
  ecran?: string;
  /** Ce qu'il faut dire quand l'élément manque alors qu'on est au bon endroit. */
  siAbsent?: string;
};

export type Parcours = {
  id: string;
  /** La réponse en une ligne, telle que la fenêtre d'aide la propose. */
  titre: string;
  /** Les mots par lesquels on le demande, en plus de ceux du titre. */
  motsCles: readonly string[];
  /** Les rôles concernés. Absent : référents et administrateurs. */
  roles?: readonly Role[];
  /** Où mène « Emmène-moi ». `null` : il n'y a pas d'écran où aller. */
  destination: string | null;
  /** L'étape sur laquelle on reprend une fois arrivé (la dernière par défaut). */
  arrivee?: number;
  etapes: readonly Etape[];
};

const CANDIDATS = '/espace/candidats';
const REUNION = '/espace/reunion';
const ACCUEIL = '/espace/accueil';
const PARAMETRES = '/espace/parametres';

/** La première étape de presque tous les parcours du suivi. */
const MENU_CANDIDATS: Etape = {
  ancre: `menu:${CANDIDATS}`,
  texte: 'Tout part d’ici : dans la colonne de gauche, cliquez sur « Candidats ».',
};

const CHOISIR_UN_CANDIDAT: Etape = {
  ancre: 'liste-candidats',
  ecran: CANDIDATS,
  texte: 'Cliquez sur un candidat : sa fiche s’ouvre à droite, et la liste reste en place.',
  siAbsent: 'La liste est vide dans cette vue. Essayez « En cours », ou effacez la recherche.',
};

const FICHE_DABORD = 'Choisissez d’abord un candidat dans la liste.';

const MENU_ACCUEIL: Etape = {
  ancre: `menu:${ACCUEIL}`,
  texte: 'En haut de la colonne de gauche, cliquez sur « Accueil ».',
};

const ROUE_DES_PARAMETRES: Etape = {
  ancre: `menu:${PARAMETRES}`,
  texte: 'La roue crantée, tout en bas de la colonne, ouvre les paramètres.',
};

/** Un parcours vers une rubrique des paramètres : la roue, puis la rubrique. */
function versUneRubrique(
  id: string,
  titre: string,
  motsCles: readonly string[],
  rubrique: string,
  texte: string,
): Parcours {
  const adresse = `${PARAMETRES}/${rubrique}`;
  return {
    id,
    titre,
    motsCles,
    roles: ['admin'],
    destination: adresse,
    etapes: [ROUE_DES_PARAMETRES, { ancre: `rubrique:${adresse}`, ecran: PARAMETRES, texte }],
  };
}

const MENU_REUNION: Etape = {
  ancre: `menu:${REUNION}`,
  texte: 'Dans la colonne de gauche, famille « Réseau », cliquez sur « Réunion ».',
};

export const PARCOURS: readonly Parcours[] = [
  {
    id: 'mes-candidats',
    titre: 'Voir la liste de mes candidats',
    motsCles: ['mes candidats', 'liste', 'candidats que je suis', 'que j’accompagne', 'mes dossiers'],
    destination: `${CANDIDATS}?vue=mes`,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'vue:mes',
        ecran: CANDIDATS,
        texte: 'La pastille « Mes candidats » ne garde que ceux que vous accompagnez vous-même.',
      },
      {
        ancre: 'liste-candidats',
        ecran: CANDIDATS,
        texte: 'Voici votre liste. Un clic sur un nom ouvre la fiche à droite.',
        siAbsent:
          'Vous n’accompagnez encore personne. La pastille « En cours » montre les candidats de vos collègues.',
      },
    ],
  },
  {
    id: 'candidats-de-la-loge',
    titre: 'Voir tous les candidats en cours de la loge',
    motsCles: ['en cours', 'tous les candidats', 'loge', 'collègues', 'autres candidats'],
    destination: `${CANDIDATS}?vue=loge`,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'vue:loge',
        ecran: CANDIDATS,
        texte: '« En cours » montre tous les dossiers ouverts de la loge, les vôtres et ceux de vos collègues.',
      },
    ],
  },
  {
    id: 'chercher-un-candidat',
    titre: 'Retrouver un candidat par son nom',
    motsCles: ['chercher', 'rechercher', 'retrouver', 'trouver', 'nom', 'recherche'],
    destination: CANDIDATS,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'recherche-candidats',
        ecran: CANDIDATS,
        texte: 'Tapez un nom ici, puis Entrée. La recherche porte sur la vue choisie juste en dessous.',
      },
    ],
  },
  {
    id: 'ouvrir-une-fiche',
    titre: 'Ouvrir la fiche d’un candidat',
    motsCles: ['fiche', 'profil', 'coordonnées', 'téléphone', 'adresse', 'consulter', 'dossier'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'onglets-fiche',
        ecran: CANDIDATS,
        texte: 'La fiche se lit en trois parties : le profil, les documents et le suivi.',
        siAbsent: 'Choisissez d’abord un candidat dans la liste.',
      },
    ],
  },
  {
    id: 'nouveau-candidat',
    titre: 'Ouvrir le dossier d’un nouveau candidat',
    motsCles: ['nouveau', 'ajouter', 'créer', 'inscrire', 'parrain', 'inviter', 'invitation', 'candidature'],
    roles: ['referent'],
    destination: CANDIDATS,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'nouveau-candidat',
        ecran: CANDIDATS,
        texte:
          '« Nouveau candidat » ouvre une petite fenêtre : vous y invitez le parrain, qui présente le candidat.',
      },
    ],
  },
  {
    id: 'nouveau-candidat-admin',
    titre: 'Ouvrir le dossier d’un nouveau candidat',
    motsCles: ['nouveau', 'ajouter', 'créer', 'inscrire', 'parrain', 'inviter', 'candidature'],
    roles: ['admin'],
    destination: null,
    etapes: [
      {
        ancre: `menu:${CANDIDATS}/nouveau`,
        texte:
          'Dans la famille « Admin », « Nouveau candidat » ouvre une petite fenêtre : vous y invitez le parrain, qui présente le candidat.',
      },
    ],
  },
  {
    id: 'documents-du-candidat',
    titre: 'Trouver le CV et les documents d’un candidat',
    motsCles: ['cv', 'cv anonyme', 'lettre de motivation', 'documents', 'fichier', 'télécharger', 'pièce'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'onglet:documents',
        ecran: CANDIDATS,
        texte:
          'L’onglet « Documents » réunit le CV original, la lettre de motivation et le CV anonyme.',
        siAbsent: 'Choisissez d’abord un candidat dans la liste : les onglets apparaissent avec sa fiche.',
      },
    ],
  },
  {
    id: 'suivi-du-candidat',
    titre: 'Noter ou lire le suivi d’un candidat',
    motsCles: ['suivi', 'note', 'noter', 'action', 'tâche', 'journal', 'historique', 'rendez-vous', 'entretien'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'onglet:suivi',
        ecran: CANDIDATS,
        texte: 'L’onglet « Suivi » tient le journal du dossier : ce qui a été fait, et ce qui reste à faire.',
        siAbsent: 'Choisissez d’abord un candidat dans la liste : les onglets apparaissent avec sa fiche.',
      },
      {
        ancre: 'noter-suivi',
        ecran: CANDIDATS,
        texte:
          'Écrivez ici ce qui s’est passé, choisissez la nature et le jour, puis enregistrez — ou gardez-le comme tâche à faire.',
        siAbsent: 'Seuls les référents écrivent dans le suivi ; il faut aussi être sur l’onglet « Suivi ».',
      },
    ],
  },
  {
    id: 'dossiers-clotures',
    titre: 'Retrouver les dossiers clôturés',
    motsCles: ['clôturé', 'clôturés', 'dossiers fermés', 'dossiers terminés', 'refermés'],
    destination: `${CANDIDATS}?vue=clotures`,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'vue:clotures',
        ecran: CANDIDATS,
        texte: '« Clôturés » liste les dossiers refermés. Ils restent consultables.',
      },
    ],
  },
  {
    id: 'dossiers-archives',
    titre: 'Retrouver les dossiers archivés',
    motsCles: ['archivé', 'archivés', 'archive', 'archives', 'ancien', 'anciens dossiers'],
    destination: `${CANDIDATS}?vue=archives`,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'vue:archives',
        ecran: CANDIDATS,
        texte: '« Archivés » liste les dossiers rangés après leur clôture.',
      },
    ],
  },
  {
    id: 'faire-l-appel',
    titre: 'Faire l’appel d’une réunion',
    motsCles: ['appel', 'réunion', 'présence', 'présents', 'absents', 'feuille', 'commission', 'tenue'],
    destination: REUNION,
    etapes: [
      MENU_REUNION,
      {
        ancre: 'ouvrir-appel',
        ecran: REUNION,
        texte: 'Choisissez le jour, le lieu si vous le souhaitez, puis « Ouvrir l’appel ».',
        siAbsent: 'Une feuille d’appel est déjà ouverte : elle est affichée sur cet écran.',
      },
    ],
  },
  {
    id: 'documents-de-la-reunion',
    titre: 'Produire l’affiche, le compte rendu ou l’affichette',
    motsCles: ['affiche', 'affichette', 'compte rendu', 'imprimer', 'sortir', 'pdf', 'document', 'commission', 'réunion'],
    destination: REUNION,
    etapes: [
      MENU_REUNION,
      {
        ancre: 'documents-reunion',
        ecran: REUNION,
        texte:
          'Ces boutons produisent l’affiche, le compte rendu et l’affichette de la réunion ouverte, en PDF.',
        siAbsent:
          'Ces boutons apparaissent sur une feuille d’appel ouverte. Ouvrez d’abord l’appel de la réunion.',
      },
    ],
  },
  {
    id: 'annuaire-des-referents',
    titre: 'Trouver un référent dans l’annuaire',
    motsCles: ['référent', 'référents', 'annuaire', 'collègue', 'contact', 'coordonnées d’un référent'],
    destination: '/espace/referents',
    etapes: [
      {
        ancre: 'menu:/espace/referents',
        texte: 'Dans la colonne de gauche, famille « Réseau », cliquez sur « Référents ».',
      },
      {
        ancre: 'recherche-referents',
        ecran: '/espace/referents',
        texte: 'Tapez un nom ou une loge ici, puis Entrée.',
      },
    ],
  },
  {
    id: 'provinces',
    titre: 'Voir les provinces',
    motsCles: ['province', 'provinces', 'carte', 'région'],
    destination: '/espace/provinces',
    etapes: [
      {
        ancre: 'menu:/espace/provinces',
        texte: 'Dans la colonne de gauche, famille « Réseau », cliquez sur « Province ».',
      },
    ],
  },
  {
    id: 'urgences',
    titre: 'Voir les nouvelles demandes à traiter',
    motsCles: ['urgence', 'urgences', 'urgent', 'nouvelle demande', 'nouvelles demandes', 'à traiter', 'en attente', 'accueil'],
    destination: ACCUEIL,
    etapes: [
      MENU_ACCUEIL,
      {
        ancre: 'urgences',
        ecran: ACCUEIL,
        texte: 'Les nouvelles demandes arrivent ici, rangées par type de recherche. Un clic ouvre le dossier.',
      },
    ],
  },
  {
    id: 'documents-de-la-commission',
    titre: 'Retrouver un compte rendu, une affiche ou une affichette déjà produits',
    motsCles: ['déjà produit', 'retrouver', 'ancien compte rendu', 'ancienne affiche', 'documents de la commission', 'télécharger', 'exemplaire'],
    destination: ACCUEIL,
    etapes: [
      MENU_ACCUEIL,
      {
        ancre: 'documents-commission',
        ecran: ACCUEIL,
        texte: 'Chaque compte rendu, affiche ou affichette produit est rangé ici, pour l’exercice en cours.',
      },
    ],
  },
  {
    id: 'cloturer-un-dossier',
    titre: 'Clôturer le dossier d’un candidat',
    motsCles: ['clôturer', 'clore', 'fermer', 'refermer', 'terminer', 'a trouvé un emploi', 'fin de suivi', 'abandon'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'cloturer-dossier',
        ecran: CANDIDATS,
        texte: '« Clôturer le dossier » ouvre une fenêtre : vous y dites qui a refermé le dossier, puis vous confirmez.',
        siAbsent:
          'Ce bouton n’apparaît que sur un dossier en cours, et pour l’administration, le Vénérable Maître et le Secrétaire.',
      },
    ],
  },
  {
    id: 'rouvrir-un-dossier',
    titre: 'Rouvrir un dossier clôturé',
    motsCles: ['rouvrir', 'réouvrir', 'réouverture', 'reprendre', 'annuler la clôture', 'remettre en cours'],
    destination: `${CANDIDATS}?vue=clotures`,
    arrivee: 2,
    etapes: [
      MENU_CANDIDATS,
      {
        ancre: 'vue:clotures',
        ecran: CANDIDATS,
        texte: 'La pastille « Clôturés » montre les dossiers refermés.',
      },
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'rouvrir-dossier',
        ecran: CANDIDATS,
        texte: '« Rouvrir le dossier » le remet dans les dossiers en cours, après confirmation.',
        siAbsent:
          'Ce bouton n’apparaît que sur un dossier clôturé et pas encore archivé, pour l’administration, le Vénérable Maître et le Secrétaire.',
      },
    ],
  },
  {
    id: 'corriger-une-fiche',
    titre: 'Corriger la fiche d’un candidat',
    motsCles: ['corriger', 'modifier', 'changer', 'mettre à jour', 'éditer', 'téléphone', 'adresse', 'erreur', 'stylo'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'corriger-fiche',
        ecran: CANDIDATS,
        texte: 'Le stylo ouvre la fiche en modification : coordonnées, recherche, parcours.',
        siAbsent: 'Le stylo n’apparaît que pour le référent qui accompagne ce candidat.',
      },
    ],
  },
  {
    id: 'referent-du-candidat',
    titre: 'Prendre en charge un candidat ou changer son référent',
    motsCles: ['prendre en charge', 'attribuer', 'affecter', 'désigner', 'changer de référent', 'confier', 'qui suit', 'accompagnement'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'referent-du-candidat',
        ecran: CANDIDATS,
        texte:
          'Sous « Accompagnement », la ligne « Référent » dit qui suit le candidat. Quand vous y avez droit, c’est un menu : choisir un nom l’enregistre aussitôt.',
        siAbsent: `${FICHE_DABORD} Cette partie est dans l’onglet « Profil ».`,
      },
    ],
  },
  {
    id: 'valider-le-cv-anonyme',
    titre: 'Voir ou valider le CV anonyme d’un candidat',
    motsCles: ['cv anonyme', 'valider', 'validation', 'anonyme', 'anonymisé', 'diffuser le cv'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'onglet:documents',
        ecran: CANDIDATS,
        texte: 'Le CV anonyme est dans l’onglet « Documents ».',
        siAbsent: FICHE_DABORD,
      },
      {
        ancre: 'cv-anonyme',
        ecran: CANDIDATS,
        texte: '« Voir le CV anonyme » l’ouvre en PDF. « Valider » dit qu’il a été relu et peut circuler.',
        siAbsent: 'Ce candidat n’a pas encore de CV anonyme : il se fait dès qu’un CV original est déposé.',
      },
    ],
  },
  {
    id: 'imprimer-la-fiche',
    titre: 'Imprimer la fiche ou produire l’affichette d’un candidat',
    motsCles: ['imprimer', 'impression', 'affichette d’un candidat', 'papier', 'pdf de la fiche', 'sortir la fiche'],
    destination: CANDIDATS,
    arrivee: 1,
    etapes: [
      MENU_CANDIDATS,
      CHOISIR_UN_CANDIDAT,
      {
        ancre: 'actions-fiche',
        ecran: CANDIDATS,
        texte: 'En haut de la fiche : « Imprimer » pour la fiche entière, « Affichette » pour le document à faire circuler.',
        siAbsent: FICHE_DABORD,
      },
    ],
  },
  {
    id: 'affichette-de-la-reunion',
    titre: 'Choisir le dossier de l’affichette d’une réunion',
    motsCles: ['choisir le dossier', 'dossier de l’affichette', 'affichette grisée', 'affichette éteinte', 'retenir un dossier'],
    destination: REUNION,
    etapes: [
      MENU_REUNION,
      {
        ancre: 'choix-affichette',
        ecran: REUNION,
        texte: 'Choisissez ici le dossier mis en avant : le bouton « Affichette » s’allume aussitôt.',
        siAbsent: 'Ce menu apparaît sur une feuille d’appel ouverte. Ouvrez d’abord l’appel de la réunion.',
      },
    ],
  },
  {
    id: 'registre-des-reunions',
    titre: 'Retrouver une réunion passée',
    motsCles: ['registre', 'réunion passée', 'réunions passées', 'ancienne réunion', 'reprendre un appel', 'historique des réunions', 'présences passées'],
    destination: REUNION,
    etapes: [
      MENU_REUNION,
      {
        ancre: 'registre-reunions',
        ecran: REUNION,
        texte: 'Le registre liste les réunions de l’exercice. Un clic sur une date rouvre sa feuille d’appel.',
        siAbsent: 'Aucune réunion n’a encore été tenue sur cet exercice.',
      },
    ],
  },
  {
    id: 'referents-d-une-loge',
    titre: 'Voir les référents d’une autre loge',
    motsCles: ['autre loge', 'toutes les loges', 'filtrer par loge', 'choisir une loge', 'référents d’une loge'],
    destination: '/espace/referents',
    etapes: [
      {
        ancre: 'menu:/espace/referents',
        texte: 'Dans la colonne de gauche, famille « Réseau », cliquez sur « Référents ».',
      },
      {
        ancre: 'filtre-loge',
        ecran: '/espace/referents',
        texte: 'Choisissez une loge dans ce menu, puis « Afficher ».',
        siAbsent: 'Votre compte ne voit que les référents de sa propre loge.',
      },
    ],
  },
  {
    id: 'qui-est-connecte',
    titre: 'Voir qui est connecté en ce moment',
    motsCles: ['connecté', 'connectés', 'en ligne', 'présent', 'qui est là', 'collègues en ligne'],
    destination: null,
    etapes: [
      {
        ancre: 'connectes',
        texte: 'Sous votre nom, « Aussi en ligne » montre les collègues connectés en ce moment.',
        siAbsent: 'Personne d’autre n’est connecté pour l’instant.',
      },
    ],
  },
  {
    id: 'mon-compte',
    titre: 'Changer mon nom, mon adresse ou mon mot de passe',
    motsCles: ['mot de passe', 'compte', 'profil', 'ma photo', 'mon adresse', 'courriel', 'email', 'mes informations'],
    destination: '/mon-compte',
    etapes: [
      {
        ancre: 'mon-compte',
        texte: 'La pastille à vos initiales, en haut à droite, ouvre « Mon compte ».',
      },
    ],
  },
  {
    id: 'se-deconnecter',
    titre: 'Me déconnecter',
    motsCles: ['déconnecter', 'déconnexion', 'quitter', 'sortir', 'fermer ma session'],
    destination: null,
    etapes: [
      {
        ancre: 'deconnexion',
        texte: '« Se déconnecter » est en haut à droite, à côté de vos initiales.',
      },
    ],
  },
  {
    id: 'parametres',
    titre: 'Régler les listes et les documents de la loge',
    motsCles: ['paramètres', 'réglages', 'collège', 'exercice', 'mise en page', 'configurer', 'options'],
    roles: ['admin'],
    destination: '/espace/parametres',
    etapes: [
      ROUE_DES_PARAMETRES,
    ],
  },
  {
    id: 'invitations',
    titre: 'Inviter un référent ou un administrateur',
    motsCles: ['invitation', 'invitations', 'inviter', 'nouveau référent', 'accès', 'donner un compte'],
    roles: ['admin'],
    destination: '/espace/admin',
    etapes: [
      {
        ancre: 'menu:/espace/admin',
        texte: 'Dans la famille « Admin », « Invitations » permet d’envoyer une invitation et de suivre celles déjà parties.',
      },
      {
        ancre: 'inviter',
        ecran: '/espace/admin',
        texte: 'Saisissez l’adresse de la personne et son rôle : elle reçoit un lien pour créer son compte.',
      },
    ],
  },
  versUneRubrique(
    'parametres-college',
    'Modifier les titres du collège',
    ['collège', 'titre', 'titres', 'fonction', 'vénérable', 'secrétaire', 'officier'],
    'college',
    '« Collège » liste les titres proposés sur les fiches des référents : on en ajoute, on en retire, on les ordonne.',
  ),
  versUneRubrique(
    'parametres-exercice',
    'Régler les dates de l’exercice',
    ['exercice', 'année', 'période', 'dates', 'début', 'fin', 'saison'],
    'exercice',
    '« Exercice » fixe la période de l’année en cours : le registre des réunions et l’accueil s’y tiennent.',
  ),
  versUneRubrique(
    'parametres-mise-en-page',
    'Régler la mise en page des documents',
    ['mise en page', 'logo', 'emblème', 'en-tête', 'modèle', 'gabarit', 'affiche', 'compte rendu'],
    'mise-en-page',
    '« Mise en page » règle le compte rendu, l’affiche et l’affichette : textes, images, aperçu.',
  ),
  versUneRubrique(
    'parametres-archives',
    'Consulter les archives de la loge',
    ['archives', 'archive', 'anciens documents', 'exercices passés', 'historique'],
    'archives',
    '« Archives » garde ce qui a été rangé : dossiers, réunions et documents des exercices passés.',
  ),
];

/** Les parcours qu'un rôle peut suivre — on ne guide pas vers une porte fermée. */
export function parcoursDuRole(role: Role): Parcours[] {
  if (role === 'chercheur') return [];
  return PARCOURS.filter((p) => !p.roles || p.roles.includes(role));
}

/** L'étape sur laquelle « Emmène-moi » reprend, une fois l'écran ouvert. */
export function etapeDArrivee(parcours: Parcours): number {
  const derniere = parcours.etapes.length - 1;
  const voulue = parcours.arrivee ?? derniere;
  return Math.min(Math.max(voulue, 0), derniere);
}

/** En deçà de cette largeur, en pixels, l'écran est tenu pour un téléphone. */
export const LARGEUR_DE_TELEPHONE = 600;

/** Ce que dit le personnage sur un écran de cette largeur. */
export function texteDeLEtape(etape: Etape, largeur: number): string {
  return largeur < LARGEUR_DE_TELEPHONE && etape.court ? etape.court : etape.texte;
}

/** Le chemin d'une adresse, sans ses paramètres. */
export function cheminDe(adresse: string): string {
  return adresse.split(/[?#]/)[0];
}
