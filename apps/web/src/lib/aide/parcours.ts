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
    ],
  },
  {
    id: 'dossiers-clotures',
    titre: 'Retrouver les dossiers clôturés',
    motsCles: ['clôturé', 'clôturés', 'clôture', 'fermé', 'terminé', 'rouvrir', 'a trouvé'],
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
    motsCles: ['affiche', 'affichette', 'compte rendu', 'imprimer', 'pdf', 'document', 'commission'],
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
      {
        ancre: 'menu:/espace/parametres',
        texte: 'La roue crantée, tout en bas de la colonne, ouvre les paramètres.',
      },
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
    ],
  },
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

/** Le chemin d'une adresse, sans ses paramètres. */
export function cheminDe(adresse: string): string {
  return adresse.split(/[?#]/)[0];
}
