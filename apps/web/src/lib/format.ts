/**
 * Mise en forme des dates et des noms, en français.
 *
 * Le fuseau est fixé à Europe/Paris plutôt que laissé au navigateur : la page
 * est rendue côté serveur, et sans fuseau explicite la même fiche pourrait
 * afficher deux jours différents selon la machine qui la rend.
 */

const PARIS = 'Europe/Paris';

const enLettres = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: PARIS,
});

const enChiffres = new Intl.DateTimeFormat('fr-FR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: PARIS,
});

function lire(valeur: string | null | undefined): Date | null {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** « 12 mars 2026 ». Le premier du mois s'écrit « 1er », comme il se doit. */
export function dateEnLettres(valeur: string | null | undefined): string | null {
  const date = lire(valeur);
  if (!date) return null;

  return enLettres.format(date).replace(/^1 /, '1er ');
}

/** La même date au format qu'attend `<input type="date">` : 2026-09-01. */
export function datePourChamp(valeur: string | null | undefined): string {
  const date = lire(valeur);
  if (!date) return '';

  // `en-CA` donne déjà « 2026-09-01 » ; on ne recompose pas la chaîne à la main.
  const [jour, mois, annee] = enChiffres.format(date).split('/');
  return `${annee}-${mois}-${jour}`;
}

/**
 * Depuis combien de temps, dit comme on le dirait à voix haute :
 * « aujourd'hui », « hier », « il y a 5 jours », « il y a 1 mois ».
 *
 * `maintenant` est un paramètre pour que la fonction soit éprouvable : sans
 * lui, le résultat dépendrait de l'heure à laquelle le test tourne.
 */
export function depuis(
  valeur: string | null | undefined,
  maintenant: Date = new Date(),
): string | null {
  const date = lire(valeur);
  if (!date) return null;

  const jours = Math.floor((maintenant.getTime() - date.getTime()) / 86_400_000);

  if (jours < 0) return dateEnLettres(valeur);
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 31) return `il y a ${jours} jours`;

  const mois = Math.floor(jours / 30);
  if (mois < 12) return `il y a ${mois} mois`;

  const ans = Math.floor(jours / 365);
  return ans === 1 ? 'il y a 1 an' : `il y a ${ans} ans`;
}

/**
 * « Alice Martin » → « AM ». Deux lettres au plus, en capitales.
 *
 * `secours` sert quand la fiche ne porte pas encore de nom — l'adresse e-mail,
 * en général. Une pastille vide ne dit rien ; sa première lettre, un peu.
 */
export function initiales(
  prenom?: string | null,
  nom?: string | null,
  secours?: string | null,
): string {
  const lettres = [prenom, nom]
    .map((mot) => mot?.trim()?.[0] ?? '')
    .filter(Boolean)
    .join('');

  return (lettres || secours?.trim()?.[0] || '?').toUpperCase().slice(0, 2);
}

/** « Alice Martin », ou « Sans nom » quand la fiche n'en porte aucun. */
export function nomComplet(prenom?: string | null, nom?: string | null): string {
  return [prenom, nom].map((mot) => mot?.trim()).filter(Boolean).join(' ') || 'Sans nom';
}

/**
 * Comment nommer **la personne connectée** à l'écran.
 *
 * Son nom si elle en a un, sinon son adresse. Un compte fraîchement créé n'en
 * porte pas encore — celui du premier administrateur, par exemple, qui n'est
 * passé par aucun formulaire — et « Sans nom » écrit sous la marque ne dit
 * rien à personne, alors qu'une adresse identifie sans ambiguïté.
 */
export function nomAffichable(
  prenom?: string | null,
  nom?: string | null,
  email?: string | null,
): string {
  const complet = [prenom, nom]
    .map((mot) => mot?.trim())
    .filter(Boolean)
    .join(' ');

  return complet || email?.trim() || 'Sans nom';
}

export type Telephone = {
  /** « 06 12 34 56 78 » — ce qu'on lit. */
  affiche: string;
  /** « +33612345678 » — ce qu'on compose, sans espace ni point. */
  lien: string;
  /** Un numéro français, reconnu comme tel : on peut lui mettre le drapeau. */
  francais: boolean;
};

/**
 * Met un numéro en forme, sans jamais le réécrire à l'aveugle.
 *
 * Bubble a laissé de tout : `0612345678`, `06.12.34.56.78`,
 * `+33 6 12 34 56 78`, et des choses qui ne sont pas des numéros. Un numéro
 * français reconnu se présente par paires, avec son drapeau. Tout le reste est
 * rendu tel quel — un numéro étranger mal découpé serait pire qu'un numéro
 * brut, et un numéro qu'on ne comprend pas reste une information utile.
 */
export function telephone(valeur: string | null | undefined): Telephone | null {
  const brut = valeur?.trim();
  if (!brut) return null;

  // Tout ce qui n'est ni chiffre ni « + » de tête s'en va : espaces, points,
  // tirets, parenthèses, espaces insécables recopiés d'un tableur.
  const plus = brut.startsWith('+');
  const chiffres = brut.replace(/\D/g, '');
  if (chiffres === '') return { affiche: brut, lien: brut, francais: false };

  // +33 6 12 34 56 78 → 06 12 34 56 78. Idem pour 0033.
  let national = chiffres;
  if (plus && chiffres.startsWith('33')) national = `0${chiffres.slice(2)}`;
  else if (chiffres.startsWith('0033')) national = `0${chiffres.slice(4)}`;

  const francais = /^0[1-9]\d{8}$/.test(national);
  if (!francais) {
    return { affiche: brut, lien: (plus ? '+' : '') + chiffres, francais: false };
  }

  return {
    affiche: national.replace(/(\d\d)(?=\d)/g, '$1 '),
    lien: `+33${national.slice(1)}`,
    francais: true,
  };
}

/**
 * Découpe un champ de texte libre en étiquettes. Bubble stockait compétences et
 * savoir-être en une seule chaîne, séparées tantôt par des virgules, tantôt par
 * des points-virgules ou des retours à la ligne.
 */
export function enEtiquettes(valeur: string | null | undefined): string[] {
  if (!valeur) return [];

  return valeur
    .split(/[,;\n·]/)
    .map((mot) => mot.trim())
    .filter((mot) => mot !== '');
}
