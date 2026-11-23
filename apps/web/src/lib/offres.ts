import { z } from 'zod';

/**
 * Les filtres de l'écran « France Travail » : un ou plusieurs départements, un
 * secteur d'activité (migration 0097) et des mots à chercher (0100).
 *
 * Ce module est pur — lire l'adresse, la réécrire, nommer un département — et
 * sert au serveur comme au navigateur. La lecture en base est dans
 * `offres-serveur.ts`.
 *
 * Rien ici ne protège quoi que ce soit : la base refuse elle-même qui n'a pas
 * l'écran, et borne la liste. Ce module ne fait que ranger.
 */

/** Les départements, par numéro. Sert à nommer ceux que la base propose. */
export const DEPARTEMENTS: Readonly<Record<string, string>> = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence',
  '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes',
  '09': 'Ariège', '10': 'Aube', '11': 'Aude', '12': 'Aveyron',
  '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente',
  '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse', '21': 'Côte-d’Or', '22': 'Côtes-d’Armor', '23': 'Creuse',
  '24': 'Dordogne', '25': 'Doubs', '26': 'Drôme', '27': 'Eure',
  '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute-Garonne',
  '32': 'Gers', '33': 'Gironde', '34': 'Hérault', '35': 'Ille-et-Vilaine',
  '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura',
  '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire',
  '44': 'Loire-Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne',
  '48': 'Lozère', '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne',
  '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse',
  '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme',
  '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales',
  '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône', '70': 'Haute-Saône',
  '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
  '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines',
  '79': 'Deux-Sèvres', '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne',
  '83': 'Var', '84': 'Vaucluse', '85': 'Vendée', '86': 'Vienne',
  '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort',
  '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne',
  '95': 'Val-d’Oise', '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane',
  '974': 'La Réunion', '975': 'Saint-Pierre-et-Miquelon', '976': 'Mayotte',
  '977': 'Saint-Barthélemy', '978': 'Saint-Martin', '986': 'Wallis-et-Futuna',
  '987': 'Polynésie française', '988': 'Nouvelle-Calédonie',
};

/** La forme d'un numéro de département : « 33 », « 2A », « 971 ». */
const NUMERO = /^(?:[0-9]{2,3}|2[AB])$/;
/** La forme d'une section de la NAF : une lettre, de A à U. */
const SECTION = /^[A-U]$/;

/** « 33 — Gironde ». Un numéro inconnu de la table s'affiche seul. */
export function nomDuDepartement(numero: string): string {
  const nom = DEPARTEMENTS[numero];
  return nom ? `${numero} — ${nom}` : numero;
}

export type FiltresDesOffres = {
  /** Aucun : tous les départements. */
  departements: string[];
  /** Vide : tous les secteurs. Sinon la lettre de la section NAF. */
  secteur: string;
  /** Les mots cherchés, tels que tapés. Vide : pas de recherche. */
  recherche: string;
  /** La page affichée, à partir de 1. */
  page: number;
};

export const AUCUN_FILTRE: FiltresDesOffres = { departements: [], secteur: '', recherche: '', page: 1 };

/** La longueur que la base retient d'une recherche (0100) : inutile d'en porter plus. */
export const LONGUEUR_DE_RECHERCHE = 120;

/** Une recherche propre : espaces resserrées, 120 caractères au plus. */
export function nettoyerRecherche(brute: string): string {
  return brute.replace(/\s+/g, ' ').trim().slice(0, LONGUEUR_DE_RECHERCHE).trim();
}

/** Vrai si quelque chose restreint la liste — pour dire « aucune offre pour ce choix ». */
export function estFiltre(filtres: FiltresDesOffres): boolean {
  return filtres.departements.length > 0 || filtres.secteur !== '' || filtres.recherche !== '';
}

/** Le nombre d'offres par page. */
export const OFFRES_PAR_PAGE = 50;

type Parametre = string | string[] | undefined;

/**
 * Les filtres écrits dans l'adresse : `?q=boulanger&dep=33,47&secteur=F&page=2`.
 *
 * Tout ce qui n'a pas la forme attendue est ignoré, sans erreur : une adresse
 * recopiée de travers doit ouvrir la liste, pas une page d'erreur. `dep` se
 * lit aussi répété (`?dep=33&dep=47`).
 */
export function lireFiltres(parametres: {
  q?: Parametre;
  dep?: Parametre;
  secteur?: Parametre;
  page?: Parametre;
}): FiltresDesOffres {
  const bruts = (Array.isArray(parametres.dep) ? parametres.dep : [parametres.dep ?? ''])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().toUpperCase());
  const departements = [...new Set(bruts.filter((v) => NUMERO.test(v)))].sort(ordreDesNumeros);

  const brut = Array.isArray(parametres.secteur) ? parametres.secteur[0] : parametres.secteur;
  const secteur = (brut ?? '').trim().toUpperCase();

  // « 2 », pas « 2.5 », « -1 » ni « deux » : tout le reste ouvre la première.
  const numero = (Array.isArray(parametres.page) ? parametres.page[0] : parametres.page) ?? '';
  const page = /^[1-9][0-9]{0,5}$/.test(numero.trim()) ? Number(numero.trim()) : 1;

  const recherche = nettoyerRecherche((Array.isArray(parametres.q) ? parametres.q[0] : parametres.q) ?? '');

  return { departements, secteur: SECTION.test(secteur) ? secteur : '', recherche, page };
}

/**
 * L'adresse de l'écran pour ces filtres. Sans filtre : l'adresse nue.
 * `offre` : l'offre dont le détail est ouvert, s'il y en a une.
 */
export function adresseDesOffres(filtres: FiltresDesOffres, offre?: string | null): string {
  const p = new URLSearchParams();
  if (filtres.recherche) p.set('q', filtres.recherche);
  if (filtres.departements.length > 0) p.set('dep', filtres.departements.join(','));
  if (filtres.secteur) p.set('secteur', filtres.secteur);
  if (filtres.page > 1) p.set('page', String(filtres.page));
  if (offre) p.set('offre', offre);
  const suite = p.toString().replaceAll('%2C', ',');
  return suite ? `/espace/france-travail?${suite}` : '/espace/france-travail';
}

/**
 * Coche ou décoche un département, sans toucher au secteur. On revient à la
 * première page : la page 7 d'une autre liste ne veut rien dire.
 */
export function basculerDepartement(filtres: FiltresDesOffres, numero: string): FiltresDesOffres {
  const departements = filtres.departements.includes(numero)
    ? filtres.departements.filter((d) => d !== numero)
    : [...filtres.departements, numero].sort(ordreDesNumeros);
  return { ...filtres, departements, page: 1 };
}

/** Change de secteur (vide : tous), et revient à la première page. */
export function choisirSecteur(filtres: FiltresDesOffres, secteur: string): FiltresDesOffres {
  return { ...filtres, secteur, page: 1 };
}

/** Change les mots cherchés (vide : pas de recherche), et revient à la première page. */
export function chercher(filtres: FiltresDesOffres, recherche: string): FiltresDesOffres {
  return { ...filtres, recherche: nettoyerRecherche(recherche), page: 1 };
}

/** Tous les départements, et la première page. */
export function tousLesDepartements(filtres: FiltresDesOffres): FiltresDesOffres {
  return { ...filtres, departements: [], page: 1 };
}

/** Combien de pages pour ce total. Une liste vide tient en une page. */
export function nombreDePages(total: number, parPage: number = OFFRES_PAR_PAGE): number {
  return Math.max(1, Math.ceil(total / parPage));
}

/** Ce que dit le bouton des départements, refermé. */
export function resumeDesDepartements(choisis: readonly string[]): string {
  if (choisis.length === 0) return 'Tous les départements';
  if (choisis.length === 1) return nomDuDepartement(choisis[0]);
  return `${choisis.length} départements`;
}

/** « 2A » et « 2B » entre « 19 » et « 21 », l'outre-mer à la fin. */
function ordreDesNumeros(a: string, b: string): number {
  const rang = (n: string) => (n.length === 3 ? 1000 + Number(n) : n === '2A' ? 20 : n === '2B' ? 20.5 : Number(n));
  return rang(a) - rang(b);
}

// --- Le détail d'une offre ------------------------------------------------------

const IDENTIFIANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'identifiant d'offre écrit dans l'adresse (`?offre=…`), ou `null` s'il n'en a pas la forme. */
export function lireIdentifiantDOffre(valeur: string | string[] | undefined): string | null {
  const brut = (Array.isArray(valeur) ? valeur[0] : valeur)?.trim() ?? '';
  return IDENTIFIANT.test(brut) ? brut.toLowerCase() : null;
}

const texte = z.string().nullable();

const Detail = z.object({
  id: z.string(),
  intitule: texte,
  description: texte,
  appellation_libelle: texte,
  rome_libelle: texte,
  type_contrat_libelle: texte,
  nature_contrat: texte,
  duree_travail_libelle: texte,
  duree_travail_type: texte,
  salaire_libelle: texte,
  experience_libelle: texte,
  qualification_libelle: texte,
  alternance: z.boolean().nullable(),
  nombre_postes: z.number().nullable(),
  accessible_th: z.boolean().nullable(),
  entreprise_adaptee: z.boolean().nullable(),
  lieu_libelle: texte,
  secteur_libelle: texte,
  entreprise_nom: texte,
  entreprise_description: texte,
  entreprise_url: texte,
  entreprise_taille: texte,
  url_origine: texte,
  date_creation: texte,
  date_actualisation: texte,
});

export type DetailDOffre = z.infer<typeof Detail>;

/** Les colonnes que le détail demande à la base — celles-là, et pas `*`. */
export const COLONNES_DU_DETAIL = Object.keys(Detail.shape).join(', ');

/** Lit la ligne rendue par la base. `null` si elle n'a pas la forme attendue. */
export function lireDetail(donnees: unknown): DetailDOffre | null {
  const lu = Detail.safeParse(donnees);
  return lu.success ? lu.data : null;
}

/**
 * Une adresse venue de France Travail, si elle peut devenir un lien : `http`
 * ou `https`, rien d'autre. Ces adresses viennent de l'extérieur ; un
 * `javascript:` glissé là ne doit jamais atterrir dans un `href`.
 */
export function lienSur(adresse: string | null | undefined): string | null {
  const brute = adresse?.trim() ?? '';
  if (!brute) return null;
  try {
    const lue = new URL(brute);
    return lue.protocol === 'https:' || lue.protocol === 'http:' ? lue.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Les points du détail — « Contrat », « Salaire »… — dans l'ordre d'affichage,
 * réduits à ceux que l'offre renseigne. Une ligne vide ne dit rien : on ne
 * l'affiche pas.
 */
export function pointsDuDetail(o: DetailDOffre): { libelle: string; valeur: string }[] {
  const contrat = [o.type_contrat_libelle, o.nature_contrat]
    .filter((v, i, tous) => v && tous.indexOf(v) === i)
    .join(' — ');
  const duree = [o.duree_travail_type, o.duree_travail_libelle]
    .filter((v, i, tous) => v && tous.indexOf(v) === i)
    .join(' — ');
  const metier = o.appellation_libelle ?? o.rome_libelle;
  const mentions = [
    o.alternance ? 'En alternance' : null,
    o.accessible_th ? 'Accessible aux travailleurs handicapés' : null,
    o.entreprise_adaptee ? 'Entreprise adaptée' : null,
  ].filter(Boolean);

  const points: [string, string | null | undefined][] = [
    ['Lieu', o.lieu_libelle],
    ['Contrat', contrat],
    ['Temps de travail', duree],
    ['Salaire', o.salaire_libelle],
    ['Expérience', o.experience_libelle],
    ['Qualification', o.qualification_libelle],
    ['Métier', metier],
    ['Secteur', o.secteur_libelle],
    ['Postes', o.nombre_postes && o.nombre_postes > 1 ? String(o.nombre_postes) : null],
    ['À noter', mentions.join(' · ')],
  ];
  return points
    .filter((p): p is [string, string] => Boolean(p[1]?.trim()))
    .map(([libelle, valeur]) => ({ libelle, valeur }));
}

// --- Une page de la liste (`offres_en_cours`, 0097) ----------------------------

const Page = z.object({
  total: z.number().int().nonnegative(),
  offres: z.array(
    z.object({
      id: z.string(),
      intitule: z.string().nullable(),
      entreprise_nom: z.string().nullable(),
      lieu_libelle: z.string().nullable(),
      type_contrat_libelle: z.string().nullable(),
    }),
  ),
});

export type PageDOffres = z.infer<typeof Page>;

/** Lit la réponse de la base. `null` si elle n'a pas la forme attendue. */
export function lirePage(donnees: unknown): PageDOffres | null {
  const lu = Page.safeParse(donnees);
  return lu.success ? lu.data : null;
}

// --- Ce que les menus proposent (`filtres_des_offres`, 0097) -------------------

export type SecteurPropose = { code: string; intitule: string };

export type MenusDesOffres = {
  departements: string[];
  secteurs: SecteurPropose[];
};

const Menus = z.object({
  departements: z.array(z.string()),
  secteurs: z.array(z.tuple([z.string(), z.string()])),
});

/** Lit la réponse de la base. `null` si elle n'a pas la forme attendue. */
export function lireMenus(donnees: unknown): MenusDesOffres | null {
  const lu = Menus.safeParse(donnees);
  if (!lu.success) return null;
  return {
    departements: [...lu.data.departements].sort(ordreDesNumeros),
    secteurs: lu.data.secteurs.map(([code, intitule]) => ({ code, intitule })),
  };
}

/**
 * Les menus tels que l'écran les montre : ce que la base propose, plus ce qui
 * est déjà choisi. Un département coché dont la dernière offre vient d'expirer
 * doit rester visible — sinon on ne pourrait plus le décocher.
 */
export function menusAAfficher(menus: MenusDesOffres, filtres: FiltresDesOffres): MenusDesOffres {
  const departements = [...new Set([...menus.departements, ...filtres.departements])].sort(ordreDesNumeros);
  const secteurs =
    filtres.secteur && !menus.secteurs.some((s) => s.code === filtres.secteur)
      ? [...menus.secteurs, { code: filtres.secteur, intitule: '' }].sort((a, b) => a.code.localeCompare(b.code))
      : menus.secteurs;
  return { departements, secteurs };
}
