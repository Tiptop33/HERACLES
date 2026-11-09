import { telephone } from '../format';
import type { Variables } from './balisage';

/**
 * Les dates, noms et coupes tels que les documents d'origine les écrivent.
 *
 * Les dates arrivent de la base en « AAAA-MM-JJ » (une date civile, sans
 * heure) : elles se lisent en UTC, pour qu'un serveur réglé sur un autre
 * fuseau n'imprime pas la veille.
 */

function lire(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const capitale = (mot: string) => mot.charAt(0).toLocaleUpperCase('fr-FR') + mot.slice(1);

const JOUR_SEMAINE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' });
const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' });

/** « 14/10/2026 » — la colonne DATE de l'affiche. */
export function jourEntier(iso: string | null | undefined): string {
  const d = lire(iso);
  if (!d) return '';
  const j = String(d.getUTCDate()).padStart(2, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${j}/${m}/${d.getUTCFullYear()}`;
}

/** « 14/10/26 » — la colonne DATE du compte rendu. */
export function jourCourt(iso: string | null | undefined): string {
  const entier = jourEntier(iso);
  return entier ? `${entier.slice(0, 6)}${entier.slice(8)}` : '';
}

/** « mercredi 14 octobre 2026 » — sous le titre de l'affiche. */
export function dateLongue(iso: string | null | undefined): string {
  const d = lire(iso);
  if (!d) return '';
  return `${JOUR_SEMAINE.format(d)} ${d.getUTCDate()} ${MOIS.format(d)} ${d.getUTCFullYear()}`;
}

/** « Mer 28 Octobre, 2026 » — le sous-titre du compte rendu, à la manière de Bubble. */
export function dateAbregee(iso: string | null | undefined): string {
  const d = lire(iso);
  if (!d) return '';
  const jour = capitale(JOUR_COURT.format(d).replace('.', ''));
  return `${jour} ${d.getUTCDate()} ${capitale(MOIS.format(d))}, ${d.getUTCFullYear()}`;
}

/** « Jeanne DUPONT » : le prénom tel quel, le nom en capitales. */
export function personne(prenom: string | null | undefined, nom: string | null | undefined): string {
  return [prenom?.trim(), nom?.trim().toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');
}

/** Un téléphone tel qu'on le lit — « 06 12 34 56 78 » —, ou brut s'il n'est pas reconnu. */
export function telephoneLisible(valeur: string | null | undefined): string {
  return telephone(valeur)?.affiche ?? '';
}

/**
 * Coupe un texte au dernier mot entier qui tient, et ajoute « ... ».
 *
 * C'est ce que fait le compte rendu de Bubble sur la ligne en gras de
 * « EMPLOI RECHERCHÉ » : « Consultant RH / Gestion de... ». Un texte qui tient
 * reste entier, sans points de suspension.
 */
export function couper(texte: string | null | undefined, longueur: number): string {
  const propre = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (propre.length <= longueur) return propre;
  const coupe = propre.slice(0, longueur + 1);
  const espace = coupe.lastIndexOf(' ');
  const tronque = (espace > 0 ? coupe.slice(0, espace) : propre.slice(0, longueur)).replace(/[\s,;:–-]+$/, '');
  return `${tronque}...`;
}

/** « un emploi », « un stage », « une alternance ». */
export function article(type: string | null | undefined): string {
  return /^altern/i.test(type?.trim() ?? '') ? 'une' : 'un';
}

/** Ce que la commission connaît d'elle-même : sa loge, son vénérable, son secrétaire. */
export type Commission = {
  loge_nom: string | null;
  venerable_prenom: string | null;
  venerable_nom: string | null;
  venerable_telephone: string | null;
  venerable_email: string | null;
  secretaire_prenom: string | null;
  secretaire_nom: string | null;
  secretaire_telephone: string | null;
  secretaire_email: string | null;
};

export const COMMISSION_VIDE: Commission = {
  loge_nom: null,
  venerable_prenom: null,
  venerable_nom: null,
  venerable_telephone: null,
  venerable_email: null,
  secretaire_prenom: null,
  secretaire_nom: null,
  secretaire_telephone: null,
  secretaire_email: null,
};

/** Les variables communes aux trois documents. */
export function variablesDeLaCommission(c: Commission): Variables {
  return {
    commission: c.loge_nom?.trim() ?? '',
    venerable: personne(c.venerable_prenom, c.venerable_nom),
    venerable_telephone: telephoneLisible(c.venerable_telephone),
    venerable_email: c.venerable_email?.trim() ?? '',
    secretaire: personne(c.secretaire_prenom, c.secretaire_nom),
    secretaire_telephone: telephoneLisible(c.secretaire_telephone),
    secretaire_email: c.secretaire_email?.trim() ?? '',
  };
}
