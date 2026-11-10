/**
 * Ce qui se règle dans chacun des quatre documents, et la valeur d'origine.
 *
 * UNE SEULE DESCRIPTION, DEUX LECTEURS
 *
 * L'écran Paramètres › Mise en page dessine ses champs depuis ce fichier, et
 * les gabarits PDF y lisent leurs valeurs par défaut. Ajouter un réglage, c'est
 * l'écrire ici une fois : il apparaît à l'écran, se valide à l'enregistrement,
 * et le gabarit le trouve.
 *
 * LES VALEURS PAR DÉFAUT SONT CELLES DES DOCUMENTS DE BUBBLE
 *
 * Relevées au point près sur les PDF que l'application d'origine produisait
 * (compte rendu du 28 octobre 2026, affiche du 14 octobre, affichette du
 * dossier 856) : corps, couleurs, marges, largeurs de colonnes. Sans réglage,
 * HERACLES sort les mêmes documents.
 *
 * Le CV anonyme fait exception : Bubble n'en laisse aucun gabarit à relever.
 * Ses valeurs d'origine sont celles du modèle B, « La colonne », choisi le
 * 10 novembre 2026 sur la planche `docs/maquettes/cv-anonyme-propositions.html`.
 *
 * AUCUNE DONNÉE PERSONNELLE ICI
 *
 * Les noms qui figurent sur les originaux — le président, le secrétaire, la
 * liste de diffusion — n'y sont pas. Les deux premiers viennent de la base
 * (`{venerable}`, `{secretaire}` : les titres du collège) ; la liste de
 * diffusion se saisit dans les réglages de chaque installation.
 *
 * Fichier sans dépendance serveur : l'écran le charge aussi.
 */

export type DocumentCle = 'compte_rendu' | 'affiche' | 'affichette' | 'cv_anonyme';

export const DOCUMENTS: readonly DocumentCle[] = ['compte_rendu', 'affiche', 'affichette', 'cv_anonyme'];

export function estUnDocument(valeur: unknown): valeur is DocumentCle {
  return typeof valeur === 'string' && (DOCUMENTS as readonly string[]).includes(valeur);
}

/** Le segment d'adresse de chaque document, dans Paramètres › Mise en page. */
export const ADRESSES: Readonly<Record<DocumentCle, string>> = {
  compte_rendu: 'compte-rendu',
  affiche: 'affiche',
  affichette: 'affichette',
  cv_anonyme: 'cv-anonyme',
};

export function documentDeLAdresse(segment: string): DocumentCle | null {
  return DOCUMENTS.find((d) => ADRESSES[d] === segment) ?? null;
}

export type Valeur = string | number | boolean;
export type Reglages = Record<string, Valeur>;

export type Genre =
  | 'texte'
  | 'nombre'
  | 'couleur'
  | 'choix'
  | 'case'
  | 'largeur'
  | 'image';

export type Champ = {
  cle: string;
  libelle: string;
  genre: Genre;
  defaut: Valeur;
  /** `texte` : nombre de lignes de la zone de saisie. */
  lignes?: number;
  /** `nombre` : bornes et pas. */
  min?: number;
  max?: number;
  pas?: number;
  unite?: string;
  /** `choix` : les valeurs possibles. */
  options?: ReadonlyArray<{ valeur: string; libelle: string }>;
  /** `image` : le fichier d'origine, dans `ressources/images`. */
  fichier?: string;
  aide?: string;
};

/** Une ligne de l'écran : un libellé, et les champs qui se règlent ensemble. */
export type Ligne = { libelle: string; champs: Champ[]; aide?: string };

export type Section = { titre: string; aide?: string; lignes: Ligne[] };

export type Gabarit = {
  document: DocumentCle;
  libelle: string;
  /** Ce que le document est, en une phrase, sous l'onglet. */
  propos: string;
  sections: Section[];
  /** Les variables que ce document sait remplir, pour l'aide de l'écran. */
  variables: ReadonlyArray<{ nom: string; sens: string }>;
};

// ————————————————————————————————————————————————————————————————————————————
// Les couleurs des originaux
// ————————————————————————————————————————————————————————————————————————————

/** Le bleu ardoise des titres, sur les trois documents. */
const ARDOISE = '#5a6792';
const NOIR = '#000000';
const GRIS_TEXTE = '#555555';

// ————————————————————————————————————————————————————————————————————————————
// Briques
// ————————————————————————————————————————————————————————————————————————————

const ALIGNEMENTS = [
  { valeur: 'left', libelle: 'À gauche' },
  { valeur: 'center', libelle: 'Centré' },
  { valeur: 'right', libelle: 'À droite' },
  { valeur: 'justify', libelle: 'Justifié' },
] as const;

export type Alignement = (typeof ALIGNEMENTS)[number]['valeur'];

type DefautBloc = {
  texte: string;
  taille: number;
  couleur?: string;
  gras?: boolean;
  italique?: boolean;
  alignement?: Alignement;
  avant?: number;
  /** Retrait de la première ligne, en points. Présent si fourni. */
  retrait?: number;
  /** Marge à gauche, en points. Présente si fournie. */
  gauche?: number;
  /** Marge à droite, en points. Présente si fournie. */
  droite?: number;
  /** Taille des initiales, pour l'effet « petites capitales ». Présente si fournie. */
  capitales?: number;
  lignes?: number;
  aide?: string;
};

/**
 * Un bloc de texte : le texte, puis tout ce qui le met en forme, sur une ligne
 * de l'écran.
 */
function bloc(prefixe: string, libelle: string, d: DefautBloc): Ligne {
  const champs: Champ[] = [
    {
      cle: `${prefixe}.texte`,
      libelle: 'Texte',
      genre: 'texte',
      defaut: d.texte,
      lignes: d.lignes ?? (d.texte.length > 90 || d.texte.includes('\n') ? 4 : 1),
    },
    { cle: `${prefixe}.taille`, libelle: 'Taille', genre: 'nombre', defaut: d.taille, min: 4, max: 48, pas: 0.5, unite: 'pt' },
  ];
  if (d.capitales !== undefined) {
    champs.push({
      cle: `${prefixe}.capitales`,
      libelle: 'Initiales',
      genre: 'nombre',
      defaut: d.capitales,
      min: 4,
      max: 60,
      pas: 0.5,
      unite: 'pt',
      aide: 'La taille de la première lettre de chaque mot. Égale à la taille du texte, l’effet disparaît.',
    });
  }
  champs.push(
    { cle: `${prefixe}.couleur`, libelle: 'Couleur', genre: 'couleur', defaut: d.couleur ?? NOIR },
    { cle: `${prefixe}.gras`, libelle: 'Gras', genre: 'case', defaut: d.gras ?? false },
    { cle: `${prefixe}.italique`, libelle: 'Italique', genre: 'case', defaut: d.italique ?? false },
    {
      cle: `${prefixe}.alignement`,
      libelle: 'Alignement',
      genre: 'choix',
      defaut: d.alignement ?? 'left',
      options: ALIGNEMENTS,
    },
    { cle: `${prefixe}.avant`, libelle: 'Espace avant', genre: 'nombre', defaut: d.avant ?? 0, min: 0, max: 200, pas: 0.5, unite: 'pt' },
  );
  if (d.gauche !== undefined) {
    champs.push({ cle: `${prefixe}.gauche`, libelle: 'Marge à gauche', genre: 'nombre', defaut: d.gauche, min: 0, max: 200, pas: 0.5, unite: 'pt' });
  }
  if (d.droite !== undefined) {
    champs.push({ cle: `${prefixe}.droite`, libelle: 'Marge à droite', genre: 'nombre', defaut: d.droite, min: 0, max: 200, pas: 0.5, unite: 'pt' });
  }
  if (d.retrait !== undefined) {
    champs.push({ cle: `${prefixe}.retrait`, libelle: 'Retrait 1re ligne', genre: 'nombre', defaut: d.retrait, min: 0, max: 200, pas: 0.5, unite: 'pt' });
  }
  champs.push({ cle: `${prefixe}.visible`, libelle: 'Visible', genre: 'case', defaut: true });
  return { libelle, champs, aide: d.aide };
}

type DefautImage = { fichier: string; largeur: number; hauteur?: number; avant?: number };

/** Une image : l'emblème d'origine, ou celle qu'on dépose à sa place. */
function image(prefixe: string, libelle: string, d: DefautImage): Ligne {
  const champs: Champ[] = [
    { cle: `${prefixe}.image`, libelle: 'Image', genre: 'image', defaut: 'origine', fichier: d.fichier },
    { cle: `${prefixe}.largeur`, libelle: 'Largeur', genre: 'nombre', defaut: d.largeur, min: 4, max: 595, pas: 0.5, unite: 'pt' },
    {
      cle: `${prefixe}.hauteur`,
      libelle: 'Hauteur',
      genre: 'nombre',
      defaut: d.hauteur ?? 0,
      min: 0,
      max: 842,
      pas: 0.5,
      unite: 'pt',
      aide: '0 : la hauteur suit la largeur, sans déformer l’image.',
    },
  ];
  if (d.avant !== undefined) {
    champs.push({ cle: `${prefixe}.avant`, libelle: 'Espace avant', genre: 'nombre', defaut: d.avant, min: 0, max: 200, pas: 0.5, unite: 'pt' });
  }
  champs.push({ cle: `${prefixe}.visible`, libelle: 'Visible', genre: 'case', defaut: true });
  return { libelle, champs };
}

type DefautColonne = { titre: string; largeur: string; gras?: boolean; alignement?: Alignement };

/** Une colonne de tableau : son titre, sa largeur, son style. */
function colonne(prefixe: string, libelle: string, d: DefautColonne): Ligne {
  return {
    libelle,
    champs: [
      { cle: `${prefixe}.titre`, libelle: 'Titre', genre: 'texte', defaut: d.titre, lignes: 1 },
      {
        cle: `${prefixe}.largeur`,
        libelle: 'Largeur',
        genre: 'largeur',
        defaut: d.largeur,
        aide: '« auto » : la largeur du contenu. « * » : le reste de la page, partagé. Un nombre : des points.',
      },
      { cle: `${prefixe}.gras`, libelle: 'Gras', genre: 'case', defaut: d.gras ?? false },
      { cle: `${prefixe}.alignement`, libelle: 'Alignement', genre: 'choix', defaut: d.alignement ?? 'left', options: ALIGNEMENTS },
      { cle: `${prefixe}.visible`, libelle: 'Visible', genre: 'case', defaut: true },
    ],
  };
}

type DefautTableau = {
  avant: number;
  fondEntete: string;
  texteEntete: string;
  tailleEntete: number;
  tailleCorps: number;
  zebre: string;
  bordure: string;
  marge?: number;
};

/** Le style d'un tableau : l'en-tête, les lignes, les filets. */
function styleDeTableau(prefixe: string, d: DefautTableau): Ligne[] {
  return [
    {
      libelle: 'En-tête du tableau',
      champs: [
        { cle: `${prefixe}.avant`, libelle: 'Espace avant', genre: 'nombre', defaut: d.avant, min: 0, max: 200, pas: 0.5, unite: 'pt' },
        { cle: `${prefixe}.entete.fond`, libelle: 'Fond', genre: 'couleur', defaut: d.fondEntete },
        { cle: `${prefixe}.entete.couleur`, libelle: 'Texte', genre: 'couleur', defaut: d.texteEntete },
        { cle: `${prefixe}.entete.taille`, libelle: 'Taille', genre: 'nombre', defaut: d.tailleEntete, min: 4, max: 24, pas: 0.5, unite: 'pt' },
      ],
    },
    {
      libelle: 'Lignes du tableau',
      champs: [
        { cle: `${prefixe}.corps.taille`, libelle: 'Taille', genre: 'nombre', defaut: d.tailleCorps, min: 4, max: 24, pas: 0.5, unite: 'pt' },
        {
          cle: `${prefixe}.zebre`,
          libelle: 'Une ligne sur deux',
          genre: 'couleur',
          defaut: d.zebre,
          aide: 'Le fond d’une ligne sur deux. Blanc : toutes les lignes pareilles.',
        },
        { cle: `${prefixe}.bordure`, libelle: 'Filets', genre: 'couleur', defaut: d.bordure },
        {
          cle: `${prefixe}.marge`,
          libelle: 'Marge des cellules',
          genre: 'nombre',
          defaut: d.marge ?? 2,
          min: 0,
          max: 20,
          pas: 0.5,
          unite: 'pt',
          aide: 'L’espace au-dessus et au-dessous du texte, dans chaque cellule.',
        },
      ],
    },
  ];
}

function page(police: 'Poppins' | 'Roboto', marges: [number, number, number, number]): Section {
  const [gauche, haut, droite, bas] = marges;
  const marge = (cle: string, libelle: string, defaut: number): Champ => ({
    cle: `page.marge.${cle}`,
    libelle,
    genre: 'nombre',
    defaut,
    min: 0,
    max: 200,
    pas: 0.5,
    unite: 'pt',
  });
  return {
    titre: 'Page',
    lignes: [
      {
        libelle: 'Police',
        champs: [
          {
            cle: 'page.police',
            libelle: 'Police',
            genre: 'choix',
            defaut: police,
            options: [
              { valeur: 'Poppins', libelle: 'Poppins' },
              { valeur: 'Roboto', libelle: 'Roboto' },
            ],
          },
        ],
      },
      {
        libelle: 'Marges (A4)',
        champs: [marge('gauche', 'Gauche', gauche), marge('haut', 'Haut', haut), marge('droite', 'Droite', droite), marge('bas', 'Bas', bas)],
      },
    ],
  };
}

const nombre = (cle: string, libelle: string, defaut: number, min: number, max: number, aide?: string): Champ => ({
  cle,
  libelle,
  genre: 'nombre',
  defaut,
  min,
  max,
  pas: 0.5,
  unite: 'pt',
  aide,
});

const couleur = (cle: string, libelle: string, defaut: string): Champ => ({ cle, libelle, genre: 'couleur', defaut });

const caseACocher = (cle: string, libelle: string, defaut: boolean, aide?: string): Champ => ({
  cle,
  libelle,
  genre: 'case',
  defaut,
  aide,
});

// ————————————————————————————————————————————————————————————————————————————
// Les variables communes
// ————————————————————————————————————————————————————————————————————————————

const VARIABLES_COMMISSION = [
  { nom: 'commission', sens: 'le nom de la commission (la loge)' },
  { nom: 'venerable', sens: 'le Vénérable Maître de la loge — « Prénom NOM »' },
  { nom: 'venerable_telephone', sens: 'son téléphone' },
  { nom: 'venerable_email', sens: 'son e-mail' },
  { nom: 'secretaire', sens: 'le Secrétaire de la loge — « Prénom NOM »' },
  { nom: 'secretaire_telephone', sens: 'son téléphone' },
  { nom: 'secretaire_email', sens: 'son e-mail' },
] as const;

const OBEDIENCE = 'GRANDE LOGE NATIONALE FRANCAISE';
const PROVINCE = 'GRANDE LOGE PROVINCIALE DE GUYENNE ET GASCOGNE';

// ————————————————————————————————————————————————————————————————————————————
// Le compte rendu
// ————————————————————————————————————————————————————————————————————————————

const COMPTE_RENDU: Gabarit = {
  document: 'compte_rendu',
  libelle: 'Compte rendu',
  propos: 'Après chaque réunion : la liste des présences et la dernière remarque sur chaque candidat en cours.',
  variables: [
    ...VARIABLES_COMMISSION,
    { nom: 'date', sens: 'le jour de la réunion — « mercredi 28 octobre 2026 »' },
    { nom: 'date_abregee', sens: 'le même, abrégé — « Mer 28 Octobre, 2026 »' },
    { nom: 'nombre_dossiers', sens: 'le plus grand numéro de dossier de la commission' },
    { nom: 'prochaine_date', sens: 'la prochaine réunion — « 11/11/2026 »' },
    { nom: 'lieu', sens: 'le lieu des réunions de la loge' },
    { nom: 'page', sens: 'le numéro de la page (pied de page)' },
    { nom: 'pages', sens: 'le nombre de pages (pied de page)' },
  ],
  sections: [
    page('Poppins', [36, 40, 36, 106]),
    {
      titre: 'En-tête',
      lignes: [
        image('entete.logo_gauche', 'Logo de gauche', { fichier: 'logo-obedience.jpg', largeur: 60 }),
        image('entete.logo_droit', 'Logo de droite', { fichier: 'blason-province.jpg', largeur: 60 }),
        { libelle: 'Position', champs: [nombre('entete.avant', 'Espace avant', 2, 0, 200)] },
        bloc('entete.obedience', 'Obédience', { texte: OBEDIENCE, taille: 15, capitales: 19, gras: true, alignement: 'center', avant: 2 }),
        bloc('entete.province', 'Province', { texte: PROVINCE, taille: 10, gras: true, alignement: 'center', avant: 9 }),
        bloc('entete.commission', 'Commission', {
          texte: 'COMMISSION EMPLOI "HERACLES" GIRONDE',
          taille: 14,
          gras: true,
          alignement: 'center',
          avant: 6,
        }),
      ],
    },
    {
      titre: 'Présentation',
      lignes: [
        bloc('mission', 'Texte de présentation', {
          texte:
            'La Commission «HERACLES», a été créé en 2001 sous l’impulsion du Grand-Maître-Provincial de l’époque, ' +
            'elle a pour but de permettre aux Frères, épouses de Frères ou enfants de Frères en recherche d’emploi, ' +
            'de pouvoir au plus vite retrouver une situation professionnelle normale. Grâce à l’aide morale, au fait ' +
            'que le demandeur soit suivi et surtout avec le soutien des membres de la commission, les demandeurs ' +
            'd’emploi se sentent plus motivés et sont donc plus actifs dans leurs recherches. La commission ' +
            '«HERACLES», a traité, à ce jour plus de {nombre_dossiers} dossiers.',
          taille: 8.5,
          alignement: 'justify',
          avant: 3,
          retrait: 15,
          lignes: 6,
        }),
      ],
    },
    {
      titre: 'Présences',
      lignes: [
        bloc('presences.titre', 'Titre', { texte: 'PRÉSENCES', taille: 13, couleur: ARDOISE, gras: true, avant: 3 }),
        bloc('presences.sous_titre', 'Sous-titre', {
          texte: 'Compte-Rendu des travaux de la commission du {date_abregee}',
          taille: 11,
          couleur: ARDOISE,
          gras: true,
          alignement: 'right',
          avant: 6,
        }),
        ...styleDeTableau('presences.tableau', {
          avant: 6,
          fondEntete: ARDOISE,
          texteEntete: '#ffffff',
          tailleEntete: 8,
          tailleCorps: 8,
          zebre: '#f4f6fb',
          bordure: '#cccccc',
          marge: 1.5,
        }),
        colonne('presences.col.nom', 'Colonne « nom »', { titre: 'NOM', largeur: '120' }),
        colonne('presences.col.email', 'Colonne « e-mail »', { titre: 'E-MAIL', largeur: '*' }),
        colonne('presences.col.telephone', 'Colonne « téléphone »', { titre: 'TÉLÉPHONE', largeur: '95' }),
        colonne('presences.col.reunion', 'Colonne « réunion »', { titre: 'RÉUNION', largeur: 'auto', alignement: 'center' }),
        colonne('presences.col.presence', 'Colonne « présence »', { titre: 'PRÉSENCE', largeur: 'auto', alignement: 'center' }),
        colonne('presences.col.taux', 'Colonne « % »', { titre: '%', largeur: '36', alignement: 'center' }),
        {
          libelle: 'Présent, absent, excusé',
          champs: [
            couleur('presences.present', 'P', '#27ae60'),
            couleur('presences.absent', 'A', '#c0392b'),
            couleur('presences.excuse', 'E', '#e84393'),
            nombre('presences.marque.taille', 'Taille', 9, 4, 24),
            caseACocher('presences.drapeau', 'Drapeau devant les numéros français', true),
          ],
        },
      ],
    },
    {
      titre: 'Prochaine réunion',
      aide:
        'Les réunions se tiennent le 2e et le 4e mercredi du mois. La prochaine est celle déjà inscrite au registre ; ' +
        'à défaut, elle se calcule, et une date qui tombe un jour férié est reportée.',
      lignes: [
        {
          libelle: 'Cadre',
          champs: [
            caseACocher('prochaine.visible', 'Visible', true),
            nombre('prochaine.avant', 'Espace avant', 7.5, 0, 200),
            couleur('prochaine.fond', 'Fond', '#fcefa1'),
            couleur('prochaine.bordure', 'Bordure', '#e0b400'),
            nombre('prochaine.epaisseur', 'Épaisseur', 1.2, 0, 10),
            nombre('prochaine.marge', 'Marge intérieure', 4, 0, 40),
          ],
        },
        {
          libelle: 'Jour férié',
          champs: [
            {
              cle: 'prochaine.report',
              libelle: 'Une réunion qui tombe un jour férié est reportée',
              genre: 'choix',
              defaut: 'lendemain',
              options: [
                { valeur: 'lendemain', libelle: 'au lendemain (jeudi)' },
                { valeur: 'semaine', libelle: 'au mercredi suivant' },
                { valeur: 'aucun', libelle: 'pas de report' },
              ],
            },
          ],
        },
        bloc('prochaine.libelle', 'Libellé', { texte: 'Prochaine réunion,', taille: 11, gras: true, avant: 0, gauche: 10 }),
        bloc('prochaine.date', 'Date', { texte: '{prochaine_date}', taille: 12, gras: true, couleur: '#c0392b', alignement: 'center' }),
        bloc('prochaine.lieu', 'Lieu', { texte: '{lieu}', taille: 11, gras: true, alignement: 'right', droite: 10 }),
        bloc('avertissement', 'Avertissement', {
          texte: 'Afin que nos travaux soient constructifs et par respect pour les présents, veuillez avertir de votre absence.',
          taille: 9,
          couleur: '#e67e22',
          gras: true,
          italique: true,
          alignement: 'center',
          avant: 2,
          lignes: 2,
        }),
      ],
    },
    {
      titre: 'Liste des candidats',
      lignes: [
        { libelle: 'Nouvelle page', champs: [caseACocher('candidats.saut', 'Commencer sur une nouvelle page', true)] },
        bloc('candidats.titre', 'Titre', { texte: 'LISTE DES CANDIDATS', taille: 13, couleur: ARDOISE, gras: true, avant: 4 }),
        ...styleDeTableau('candidats.tableau', {
          avant: 8,
          fondEntete: ARDOISE,
          texteEntete: '#ffffff',
          tailleEntete: 8,
          tailleCorps: 8,
          zebre: '#f4f6fb',
          bordure: '#cccccc',
          marge: 1.5,
        }),
        colonne('candidats.col.numero', 'Colonne « N° »', { titre: 'N°', largeur: 'auto' }),
        colonne('candidats.col.date', 'Colonne « date »', { titre: 'DATE', largeur: 'auto' }),
        colonne('candidats.col.emploi', 'Colonne « emploi »', { titre: 'EMPLOI RECHERCHÉ', largeur: '*' }),
        colonne('candidats.col.nom', 'Colonne « nom »', { titre: 'NOM', largeur: 'auto' }),
        colonne('candidats.col.referent', 'Colonne « référent »', { titre: 'RÉFÉRENTS', largeur: 'auto' }),
        colonne('candidats.col.commentaire', 'Colonne « commentaire »', { titre: 'COMMENTAIRES', largeur: '*' }),
        {
          libelle: 'Emploi recherché',
          aide:
            'En gras, la définition de l’emploi, coupée au dernier mot entier ; en dessous, en italique, ' +
            'l’intitulé tel que la personne l’a écrit.',
          champs: [
            { cle: 'candidats.emploi.longueur', libelle: 'Définition coupée à', genre: 'nombre', defaut: 35, min: 5, max: 500, pas: 1, unite: 'caractères' },
            nombre('candidats.emploi.taille', 'Taille de l’intitulé', 7, 4, 24),
            couleur('candidats.emploi.couleur', 'Couleur de l’intitulé', GRIS_TEXTE),
          ],
        },
      ],
    },
    {
      titre: 'Offres d’emploi',
      lignes: [
        { libelle: 'Offres', champs: [caseACocher('offres.visible', 'Visible', true)] },
        bloc('offres.titre', 'Titre', { texte: 'OFFRES D\'EMPLOI', taille: 13, couleur: ARDOISE, gras: true, avant: 14, gauche: 4.5 }),
        ...styleDeTableau('offres.tableau', {
          avant: 7.5,
          fondEntete: ARDOISE,
          texteEntete: '#ffffff',
          tailleEntete: 8,
          tailleCorps: 8,
          zebre: '#f4f6fb',
          bordure: '#cccccc',
          marge: 1.5,
        }),
        colonne('offres.col.date', 'Colonne « date »', { titre: 'DATE', largeur: 'auto' }),
        colonne('offres.col.poste', 'Colonne « poste »', { titre: 'LE POSTE', largeur: '*' }),
        colonne('offres.col.societe', 'Colonne « société »', { titre: 'SOCIÉTÉ', largeur: '*' }),
        colonne('offres.col.ville', 'Colonne « ville »', { titre: 'VILLE', largeur: 'auto' }),
        colonne('offres.col.contact', 'Colonne « contact »', { titre: 'CONTACT', largeur: 'auto' }),
        colonne('offres.col.email', 'Colonne « e-mail »', { titre: 'E-MAIL', largeur: '*' }),
        {
          libelle: 'Société',
          champs: [
            { cle: 'offres.societe.longueur', libelle: 'Coupée à', genre: 'nombre', defaut: 20, min: 5, max: 500, pas: 1, unite: 'caractères' },
          ],
        },
      ],
    },
    {
      titre: 'Pied de page',
      aide: 'Répété sur chaque page. La liste de diffusion se saisit ici : elle n’est pas livrée avec l’application.',
      lignes: [
        {
          libelle: 'Marges du pied',
          champs: [nombre('pied.marge.gauche', 'Gauche', 24, 0, 200), nombre('pied.marge.droite', 'Droite', 24, 0, 200)],
        },
        bloc('pied.gauche.nom', 'À gauche — nom', { texte: 'GHP, RF {venerable}', taille: 7.5, couleur: ARDOISE, gras: true }),
        bloc('pied.gauche.fonction', 'À gauche — fonction', { texte: 'Président de la Commission HERACLES', taille: 6.5, couleur: GRIS_TEXTE }),
        bloc('pied.centre.information', 'Au centre — titre', {
          texte: 'Diffusion pour information',
          taille: 6.5,
          couleur: ARDOISE,
          gras: true,
          alignement: 'center',
        }),
        bloc('pied.centre.information_liste', 'Au centre — destinataires', {
          texte: '',
          taille: 6.5,
          couleur: GRIS_TEXTE,
          alignement: 'center',
          lignes: 3,
          aide: 'Une ligne par destinataire, par exemple « GMP, Prénom NOM ».',
        }),
        bloc('pied.centre.action', 'Au centre — second titre', {
          texte: 'Diffusion pour action',
          taille: 6.5,
          couleur: ARDOISE,
          gras: true,
          alignement: 'center',
          avant: 2,
        }),
        bloc('pied.centre.action_liste', 'Au centre — seconds destinataires', {
          texte: 'Membres de la commission "HERACLES"',
          taille: 6.5,
          couleur: GRIS_TEXTE,
          alignement: 'center',
          lignes: 2,
        }),
        bloc('pied.droite.nom', 'À droite — nom', { texte: '{secretaire}', taille: 7.5, couleur: ARDOISE, gras: true, alignement: 'right' }),
        bloc('pied.droite.fonction', 'À droite — fonction', {
          texte: 'Secrétariat de la commission HERACLES',
          taille: 6.5,
          couleur: GRIS_TEXTE,
          alignement: 'right',
        }),
        bloc('pied.pagination', 'Numéro de page', { texte: '{page} / {pages}', taille: 7, couleur: '#999999', alignement: 'center', avant: 3 }),
      ],
    },
  ],
};

// ————————————————————————————————————————————————————————————————————————————
// L'affiche
// ————————————————————————————————————————————————————————————————————————————

const AFFICHE: Gabarit = {
  document: 'affiche',
  libelle: 'Affiche',
  propos: 'Les dossiers en cours, sans aucun nom : le numéro, la date d’entrée, l’intitulé exact et le lien du CV anonyme.',
  variables: [
    ...VARIABLES_COMMISSION,
    { nom: 'date', sens: 'le jour de la réunion — « mercredi 14 octobre 2026 »' },
    { nom: 'nombre', sens: 'le nombre de dossiers listés' },
    { nom: 's', sens: '« s » s’il y en a plusieurs, rien sinon' },
  ],
  sections: [
    page('Poppins', [28, 28, 28, 28]),
    {
      titre: 'En-tête',
      lignes: [
        image('entete.logo_gauche', 'Logo de gauche', { fichier: 'logo-obedience.jpg', largeur: 63 }),
        image('entete.logo_droit', 'Logo de droite', { fichier: 'blason-province.jpg', largeur: 63 }),
        { libelle: 'Position', champs: [nombre('entete.avant', 'Espace avant', 2, 0, 200)] },
        bloc('entete.obedience', 'Obédience', { texte: OBEDIENCE, taille: 14, capitales: 19, gras: true, alignement: 'center', avant: 10 }),
        bloc('entete.province', 'Province', { texte: PROVINCE, taille: 10, gras: true, alignement: 'center', avant: 14 }),
      ],
    },
    {
      titre: 'Titre',
      lignes: [
        bloc('titre', 'Titre', {
          texte: 'COMMISSION EMPLOI « HERACLES » GIRONDE',
          taille: 18,
          couleur: ARDOISE,
          gras: true,
          alignement: 'center',
          avant: 16,
        }),
        bloc('date', 'Date', { texte: '{date}', taille: 12, couleur: ARDOISE, gras: true, alignement: 'center', avant: 2 }),
        bloc('compte', 'Nombre de dossiers', {
          texte: '{nombre} DOSSIER{s} EN SOUFFRANCE',
          taille: 14,
          couleur: ARDOISE,
          gras: true,
          alignement: 'center',
          avant: 8,
        }),
        bloc('mission', 'Présentation', {
          texte:
            'La Commission « HERACLES », a pour mission d\'apporter aide et soutien aux Frères, épouses de Frères et ' +
            'enfants de Frères en recherche d\'emploi. La commission n\'a pas vocation à se substituer au candidat en ' +
            'recherche mais plutôt de faciliter la circulation des informations sur les postes à pourvoir et les ' +
            'offres d\'emplois qui lui sont remontés.',
          taille: 9.5,
          alignement: 'justify',
          avant: 12,
          lignes: 4,
        }),
      ],
    },
    {
      titre: 'Tableau des dossiers',
      lignes: [
        ...styleDeTableau('dossiers.tableau', {
          avant: 14,
          fondEntete: '#f0f0f0',
          texteEntete: NOIR,
          tailleEntete: 9,
          tailleCorps: 9,
          zebre: '#fafafa',
          bordure: '#cccccc',
        }),
        colonne('dossiers.col.numero', 'Colonne « N° »', { titre: 'N°', largeur: '28', gras: true, alignement: 'center' }),
        colonne('dossiers.col.date', 'Colonne « date »', { titre: 'DATE', largeur: '55' }),
        colonne('dossiers.col.intitule', 'Colonne « intitulé »', {
          titre: 'FRÈRES EN RECHERCHE D\'EMPLOI OU DE STAGES',
          largeur: '*',
          gras: true,
        }),
        colonne('dossiers.col.cv', 'Colonne « CV »', { titre: 'CV', largeur: '34', gras: true, alignement: 'center' }),
        {
          libelle: 'Lien du CV anonyme',
          champs: [
            { cle: 'dossiers.lien.texte', libelle: 'Texte du lien', genre: 'texte', defaut: 'CV', lignes: 1 },
            couleur('dossiers.lien.couleur', 'Couleur', '#2255aa'),
            caseACocher('dossiers.lien.souligne', 'Souligné', true),
          ],
        },
      ],
    },
    {
      titre: 'Offres d’emploi',
      lignes: [
        {
          libelle: 'Offres',
          champs: [
            caseACocher('offres.visible', 'Visible', true),
            caseACocher('offres.saut', 'Commencer sur une nouvelle page', true),
          ],
        },
        bloc('offres.titre', 'Titre', { texte: 'OFFRES D\'EMPLOI', taille: 16, couleur: ARDOISE, gras: true, alignement: 'center' }),
        ...styleDeTableau('offres.tableau', {
          avant: 14,
          fondEntete: '#ecf5fe',
          texteEntete: NOIR,
          tailleEntete: 9,
          tailleCorps: 8,
          zebre: '#ffffff',
          bordure: '#bbccdd',
        }),
        colonne('offres.col.date', 'Colonne « date »', { titre: 'DATE', largeur: '45', gras: false }),
        colonne('offres.col.poste', 'Colonne « poste »', { titre: 'LE POSTE', largeur: '*' }),
        colonne('offres.col.societe', 'Colonne « société »', { titre: 'SOCIÉTÉ', largeur: '80' }),
        colonne('offres.col.ville', 'Colonne « ville »', { titre: 'VILLE', largeur: '55' }),
        colonne('offres.col.contact', 'Colonne « contact »', { titre: 'CONTACT', largeur: '70' }),
        colonne('offres.col.email', 'Colonne « e-mail »', { titre: 'E-MAIL', largeur: '60' }),
      ],
    },
    {
      titre: 'Contacts',
      aide: 'Une ligne par contact. Les adresses e-mail deviennent des liens cliquables.',
      lignes: [
        {
          libelle: 'Encadré',
          champs: [
            caseACocher('contacts.visible', 'Visible', true),
            nombre('contacts.avant', 'Espace avant', 14, 0, 200),
            nombre('contacts.largeur', 'Largeur', 552.9, 50, 595, 'L’original déborde légèrement de la marge de droite : 552,9 pt.'),
            couleur('contacts.fond', 'Fond', '#d7f7ff'),
            couleur('contacts.bordure', 'Bordure', '#aaccdd'),
            couleur('contacts.lien', 'Liens', '#2255aa'),
          ],
        },
        bloc('contacts.titre', 'Titre', { texte: 'Contacts :', taille: 9.5, gras: true }),
        bloc('contacts.lignes', 'Contacts', {
          texte:
            '**{venerable}**, Président de la Commission HERACLES, Tél : {venerable_telephone}  {venerable_email}\n' +
            '**{secretaire}**, Secrétariat de la Commission HERACLES, Tél : {secretaire_telephone}  {secretaire_email}',
          taille: 9,
          avant: 3,
          lignes: 3,
          aide: 'L’espace avant s’applique à chaque ligne.',
        }),
      ],
    },
  ],
};

// ————————————————————————————————————————————————————————————————————————————
// L'affichette
// ————————————————————————————————————————————————————————————————————————————

const AFFICHETTE: Gabarit = {
  document: 'affichette',
  libelle: 'Affichette',
  propos: 'Le dossier du mois, choisi en réunion : son numéro, l’emploi recherché, le rayon d’action, et le QR code du CV anonyme.',
  variables: [
    ...VARIABLES_COMMISSION,
    { nom: 'numero', sens: 'le numéro du dossier' },
    { nom: 'article', sens: '« un » ou « une », selon ce qui est recherché' },
    { nom: 'type', sens: 'emploi, stage, alternance' },
    { nom: 'intitule', sens: 'l’intitulé exact de l’emploi recherché' },
    { nom: 'rayon', sens: 'le rayon d’action — Agglomération, Départementale…' },
  ],
  sections: [
    page('Roboto', [36, 36, 36, 36]),
    {
      titre: 'Décor',
      lignes: [
        image('decor.cordeliere', 'Cordelière', { fichier: 'cordeliere.png', largeur: 480 }),
        image('decor.colonne', 'Colonnes', { fichier: 'colonne.png', largeur: 62, hauteur: 327.56, avant: 10 }),
        image('decor.embleme_gauche', 'Emblème de gauche', { fichier: 'blason-province-grand.png', largeur: 62, hauteur: 62, avant: 8 }),
        image('decor.embleme_droit', 'Emblème de droite', { fichier: 'sceau-obedience.png', largeur: 62, hauteur: 62, avant: 8 }),
        { libelle: 'Entre les colonnes et le texte', champs: [nombre('decor.gouttiere', 'Écart', 12, 0, 100)] },
      ],
    },
    {
      titre: 'Texte d’appel',
      lignes: [
        bloc('salutation', 'Salutation', { texte: 'Mes BCFF', taille: 20, couleur: ARDOISE, gras: true, alignement: 'center' }),
        bloc('appel', 'Appel', {
          texte:
            'La commission **{commission}** est de plus en plus sollicitée par des Frères pour trouver un emploi, un stage ' +
            'ou un contrat d\'alternance pour des frères, des épouses, des fils ou des filles de frères.\n' +
            'Ceux d\'entre vous qui ont des proches dans cette situation savent à quel point cela peut être ardu.\n' +
            '**C\'est pourquoi nous avons décidé de nous mobiliser, en vous présentant chaque mois un dossier pour que ' +
            'vous soyez, vous mes Frères, le relais opérationnel de notre Chaîne d\'Union.**',
          taille: 10.5,
          avant: 10,
          lignes: 6,
        }),
        bloc('transition', 'Transition', {
          texte: 'Comment c\'est très simple, prenons le cas de ce mois.',
          taille: 10.5,
          alignement: 'center',
          avant: 12,
        }),
      ],
    },
    {
      titre: 'Le dossier',
      lignes: [
        bloc('dossier', 'Numéro', { texte: 'Dossier {numero}', taille: 18, couleur: ARDOISE, gras: true, alignement: 'center', avant: 10 }),
        {
          libelle: 'Cadre du numéro',
          champs: [
            caseACocher('dossier.cadre', 'Encadré', true),
            couleur('dossier.cadre.couleur', 'Couleur', NOIR),
            nombre('dossier.cadre.epaisseur', 'Épaisseur', 1, 0, 10),
            nombre('dossier.cadre.marge', 'Marge intérieure', 8, 0, 60),
          ],
        },
        bloc('recherche', 'Ce qui est recherché', { texte: 'Recherche {article} **{type}**', taille: 12, alignement: 'center', avant: 10 }),
        bloc('intitule', 'Intitulé', { texte: '{intitule}', taille: 13, couleur: ARDOISE, gras: true, alignement: 'center', avant: 6 }),
        bloc('rayon', 'Rayon d’action', { texte: '{rayon}', taille: 11, alignement: 'center', avant: 4 }),
      ],
    },
    {
      titre: 'Signature',
      lignes: [
        bloc('signature', 'Signature', {
          texte: '**{venerable}** GHPGG\nPrésident de la commission {commission} emploi.',
          taille: 10,
          alignement: 'center',
          avant: 16,
          lignes: 2,
        }),
      ],
    },
    {
      titre: 'QR code du CV anonyme',
      aide: 'Imprimé seulement si le candidat a un CV anonyme. Il s’ouvre sans compte, tant que le dossier est en cours.',
      lignes: [
        {
          libelle: 'QR code',
          champs: [
            caseACocher('qr.visible', 'Visible', true),
            nombre('qr.taille', 'Taille', 99, 30, 300),
            nombre('qr.avant', 'Espace avant', 8, 0, 200),
            couleur('qr.couleur', 'Couleur', NOIR),
          ],
        },
        bloc('qr.legende', 'Légende', { texte: 'CV ANONYME CANDIDAT', taille: 8, gras: true, alignement: 'center', avant: 3 }),
      ],
    },
  ],
};

// ————————————————————————————————————————————————————————————————————————————
// Le CV anonyme
// ————————————————————————————————————————————————————————————————————————————

/** Les couleurs du modèle B : la teinte de l'application, `--marque`. */
const MARQUE = '#3f9fc2';
/** Assez sombre pour porter du texte blanc (contraste 4,5:1). */
const MARQUE_APLAT = '#2a7fa1';
const MARQUE_FONCEE = '#1e6d8c';
const MARQUE_CLAIRE = '#e4f1f7';
const GRIS_DOUX = '#46525f';

const CV_ANONYME: Gabarit = {
  document: 'cv_anonyme',
  libelle: 'CV anonyme',
  propos:
    'Le CV de chaque candidat, sans rien qui l’identifie : le numéro du dossier en haut à gauche, ce qu’il recherche, ' +
    'son parcours. Il s’ouvre sans compte par le lien de l’affiche et le QR code de l’affichette, une fois validé par le référent.',
  variables: [
    { nom: 'numero', sens: 'le numéro du dossier' },
    { nom: 'contact', sens: 'l’adresse de contact réglée ci-dessus' },
    { nom: 'date', sens: 'la date du CV : celle de sa validation' },
  ],
  sections: [
    {
      titre: 'En-tête',
      lignes: [
        {
          libelle: 'Numéro du dossier',
          champs: [
            {
              cle: 'numero.ecriture',
              libelle: 'Écriture',
              genre: 'choix',
              defaut: 'n',
              options: [
                { valeur: 'n', libelle: 'N° 904' },
                { valeur: 'nu', libelle: '904' },
                { valeur: 'dossier', libelle: 'Dossier 904' },
              ],
            },
            { cle: 'numero.taille', libelle: 'Taille', genre: 'nombre', defaut: 46, min: 20, max: 72, pas: 0.5, unite: 'pt' },
          ],
        },
        {
          libelle: 'Au-dessus du numéro',
          champs: [{ cle: 'entete.sur', libelle: 'Texte', genre: 'texte', defaut: 'CV anonyme', lignes: 1 }],
        },
      ],
    },
    {
      titre: 'Couleurs',
      lignes: [
        {
          libelle: 'Teintes',
          champs: [
            couleur('couleur.aplat', 'Fond du numéro', MARQUE_APLAT),
            couleur('couleur.colonne', 'Fond de la colonne', MARQUE_CLAIRE),
            couleur('couleur.accent', 'Filets et puces', MARQUE),
            couleur('couleur.titres', 'Petits titres', MARQUE_FONCEE),
          ],
        },
      ],
    },
    {
      titre: 'Contact et date',
      aide: 'En bas de la colonne. Le CV circule hors de la loge : une adresse de la commission, jamais celle d’une personne.',
      lignes: [
        {
          libelle: 'Adresse de contact',
          champs: [
            {
              cle: 'contact.adresse',
              libelle: 'Adresse',
              genre: 'texte',
              defaut: '',
              lignes: 1,
              aide: 'Vide : la phrase de contact ne s’imprime pas.',
            },
          ],
        },
        bloc('contact', 'Phrase de contact', {
          texte: 'Pour rencontrer ce candidat, écrire à **{contact}** en citant le n° {numero}.',
          taille: 7.5,
          couleur: GRIS_DOUX,
          lignes: 2,
        }),
        bloc('date', 'Date du CV', { texte: 'CV à jour au {date}', taille: 7.5, couleur: GRIS_DOUX, avant: 4 }),
      ],
    },
  ],
};

export const GABARITS: Readonly<Record<DocumentCle, Gabarit>> = {
  compte_rendu: COMPTE_RENDU,
  affiche: AFFICHE,
  affichette: AFFICHETTE,
  cv_anonyme: CV_ANONYME,
};

/** Tous les champs d'un gabarit, à plat. */
export function champsDe(document: DocumentCle): Champ[] {
  return GABARITS[document].sections.flatMap((s) => s.lignes.flatMap((l) => l.champs));
}

const INDEX: Record<DocumentCle, Map<string, Champ>> = {
  compte_rendu: new Map(champsDe('compte_rendu').map((c) => [c.cle, c])),
  affiche: new Map(champsDe('affiche').map((c) => [c.cle, c])),
  affichette: new Map(champsDe('affichette').map((c) => [c.cle, c])),
  cv_anonyme: new Map(champsDe('cv_anonyme').map((c) => [c.cle, c])),
};

export function champ(document: DocumentCle, cle: string): Champ | undefined {
  return INDEX[document].get(cle);
}

/** Les valeurs d'origine — la présentation de Bubble. */
export function defauts(document: DocumentCle): Reglages {
  return Object.fromEntries(champsDe(document).map((c) => [c.cle, c.defaut]));
}
