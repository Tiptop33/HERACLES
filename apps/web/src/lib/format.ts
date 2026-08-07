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

/** « Alice Martin » → « AM ». Deux lettres au plus, en capitales. */
export function initiales(prenom?: string | null, nom?: string | null): string {
  const lettres = [prenom, nom]
    .map((mot) => mot?.trim()?.[0] ?? '')
    .filter(Boolean)
    .join('');

  return (lettres || '?').toUpperCase().slice(0, 2);
}

/** « Alice Martin », ou « Sans nom » quand la fiche n'en porte aucun. */
export function nomComplet(prenom?: string | null, nom?: string | null): string {
  return [prenom, nom].map((mot) => mot?.trim()).filter(Boolean).join(' ') || 'Sans nom';
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
