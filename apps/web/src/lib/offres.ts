import { z } from 'zod';

/**
 * Les filtres de l'écran « France Travail » : un ou plusieurs départements, et
 * un secteur d'activité (migration 0097).
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
};

export const AUCUN_FILTRE: FiltresDesOffres = { departements: [], secteur: '' };

type Parametre = string | string[] | undefined;

/**
 * Les filtres écrits dans l'adresse : `?dep=33,47&secteur=F`.
 *
 * Tout ce qui n'a pas la forme attendue est ignoré, sans erreur : une adresse
 * recopiée de travers doit ouvrir la liste, pas une page d'erreur. `dep` se
 * lit aussi répété (`?dep=33&dep=47`).
 */
export function lireFiltres(parametres: { dep?: Parametre; secteur?: Parametre }): FiltresDesOffres {
  const bruts = (Array.isArray(parametres.dep) ? parametres.dep : [parametres.dep ?? ''])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().toUpperCase());
  const departements = [...new Set(bruts.filter((v) => NUMERO.test(v)))].sort(ordreDesNumeros);

  const brut = Array.isArray(parametres.secteur) ? parametres.secteur[0] : parametres.secteur;
  const secteur = (brut ?? '').trim().toUpperCase();

  return { departements, secteur: SECTION.test(secteur) ? secteur : '' };
}

/** L'adresse de l'écran pour ces filtres. Sans filtre : l'adresse nue. */
export function adresseDesOffres(filtres: FiltresDesOffres): string {
  const p = new URLSearchParams();
  if (filtres.departements.length > 0) p.set('dep', filtres.departements.join(','));
  if (filtres.secteur) p.set('secteur', filtres.secteur);
  const suite = p.toString().replaceAll('%2C', ',');
  return suite ? `/espace/france-travail?${suite}` : '/espace/france-travail';
}

/** Coche ou décoche un département, sans toucher au reste. */
export function basculerDepartement(filtres: FiltresDesOffres, numero: string): FiltresDesOffres {
  const departements = filtres.departements.includes(numero)
    ? filtres.departements.filter((d) => d !== numero)
    : [...filtres.departements, numero].sort(ordreDesNumeros);
  return { ...filtres, departements };
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
