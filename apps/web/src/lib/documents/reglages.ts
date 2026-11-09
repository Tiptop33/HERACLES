import { champ, defauts, type Alignement, type Champ, type DocumentCle, type Reglages, type Valeur } from './gabarits';

/**
 * Lire et vérifier les réglages d'un document.
 *
 * La base garde les **écarts** à l'origine, clé par clé. Ce fichier les
 * vérifie à l'entrée (un nombre là où on attend un nombre, une couleur bien
 * formée, une clé que le gabarit connaît), puis les relit par-dessus les
 * valeurs d'origine au moment de produire un document.
 *
 * À la relecture, une valeur qui ne convient plus — une clé renommée depuis,
 * un type qui a changé — retombe sur l'origine plutôt que de faire échouer le
 * document : un compte rendu doit sortir le soir de la réunion.
 */

export const COULEUR = /^#[0-9a-f]{6}$/i;
const LARGEUR = /^(auto|\*|\d{1,3}(\.\d{1,2})?)$/;
const TEXTE_MAX = 2000;

export type Verdict = { ok: true; valeur: Valeur } | { ok: false; erreur: string };

/** Vérifie une valeur pour un champ, et la ramène à sa forme canonique. */
export function verifier(c: Champ, brute: unknown): Verdict {
  switch (c.genre) {
    case 'texte': {
      if (typeof brute !== 'string') return { ok: false, erreur: `${c.libelle} : un texte est attendu.` };
      const texte = brute.replace(/\r\n?/g, '\n');
      if (texte.length > TEXTE_MAX) {
        return { ok: false, erreur: `${c.libelle} : ${TEXTE_MAX} caractères au plus.` };
      }
      return { ok: true, valeur: texte };
    }
    case 'nombre': {
      const n = typeof brute === 'number' ? brute : typeof brute === 'string' ? Number(brute.replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) return { ok: false, erreur: `${c.libelle} : un nombre est attendu.` };
      if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) {
        return { ok: false, erreur: `${c.libelle} : entre ${c.min} et ${c.max}.` };
      }
      return { ok: true, valeur: Math.round(n * 1_000_000) / 1_000_000 };
    }
    case 'couleur':
      if (typeof brute !== 'string' || !COULEUR.test(brute)) {
        return { ok: false, erreur: `${c.libelle} : une couleur au format #rrggbb est attendue.` };
      }
      return { ok: true, valeur: brute.toLowerCase() };
    case 'choix':
      if (typeof brute !== 'string' || !c.options?.some((o) => o.valeur === brute)) {
        return { ok: false, erreur: `${c.libelle} : choix inconnu.` };
      }
      return { ok: true, valeur: brute };
    case 'case':
      if (typeof brute !== 'boolean') return { ok: false, erreur: `${c.libelle} : oui ou non.` };
      return { ok: true, valeur: brute };
    case 'largeur': {
      const texte = typeof brute === 'number' ? String(brute) : typeof brute === 'string' ? brute.trim() : '';
      if (!LARGEUR.test(texte)) {
        return { ok: false, erreur: `${c.libelle} : « auto », « * » ou un nombre de points.` };
      }
      return { ok: true, valeur: texte };
    }
    case 'image':
      // L'image se dépose par sa propre route ; ce réglage dit seulement
      // laquelle employer.
      if (brute !== 'origine' && brute !== 'deposee') {
        return { ok: false, erreur: `${c.libelle} : « origine » ou « deposee ».` };
      }
      return { ok: true, valeur: brute };
  }
}

/**
 * Vérifie un lot de réglages envoyé par l'écran. Tout ou rien : une seule
 * valeur fausse et rien ne s'enregistre, avec la raison.
 */
export function verifierLeLot(
  document: DocumentCle,
  lot: Record<string, unknown>,
): { ok: true; valeurs: Reglages } | { ok: false; erreur: string } {
  const valeurs: Reglages = {};
  for (const [cle, brute] of Object.entries(lot)) {
    const c = champ(document, cle);
    if (!c) return { ok: false, erreur: `Réglage inconnu : ${cle}.` };
    const verdict = verifier(c, brute);
    if (!verdict.ok) return verdict;
    valeurs[cle] = verdict.valeur;
  }
  return { ok: true, valeurs };
}

/** Les écarts gardés en base, débarrassés de ce qui ne vaut plus. */
export function nettoyer(document: DocumentCle, stockes: unknown): Reglages {
  if (!stockes || typeof stockes !== 'object' || Array.isArray(stockes)) return {};
  const propres: Reglages = {};
  for (const [cle, brute] of Object.entries(stockes as Record<string, unknown>)) {
    const c = champ(document, cle);
    if (!c) continue;
    const verdict = verifier(c, brute);
    if (verdict.ok) propres[cle] = verdict.valeur;
  }
  return propres;
}

export type Largeur = number | 'auto' | '*';

/** Ce que les gabarits lisent : la valeur réglée, ou celle d'origine. */
export type Lecteur = {
  texte(cle: string): string;
  nombre(cle: string): number;
  couleur(cle: string): string;
  oui(cle: string): boolean;
  choix(cle: string): string;
  alignement(cle: string): Alignement;
  largeur(cle: string): Largeur;
  /** L'image déposée est-elle à employer pour cet emplacement ? */
  imageDeposee(prefixe: string): boolean;
  /** Le gabarit déclare-t-il ce réglage ? Les options d'un bloc ne sont pas partout. */
  connait(cle: string): boolean;
};

export function lecteur(document: DocumentCle, ecarts: Reglages = {}): Lecteur {
  const origine = defauts(document);
  const propres = nettoyer(document, ecarts);
  const lire = (cle: string): Valeur => {
    if (cle in propres) return propres[cle];
    if (cle in origine) return origine[cle];
    // Une clé que le gabarit ne déclare pas : c'est une faute du code, pas
    // de la saisie, et elle doit se voir dès les tests.
    throw new Error(`Réglage non déclaré dans le gabarit « ${document} » : ${cle}`);
  };

  return {
    texte: (cle) => String(lire(cle)),
    nombre: (cle) => Number(lire(cle)),
    couleur: (cle) => String(lire(cle)),
    oui: (cle) => lire(cle) === true,
    choix: (cle) => String(lire(cle)),
    alignement: (cle) => String(lire(cle)) as Alignement,
    largeur: (cle) => {
      const v = String(lire(cle));
      return v === 'auto' || v === '*' ? v : Number(v);
    },
    imageDeposee: (prefixe) => lire(`${prefixe}.image`) === 'deposee',
    connait: (cle) => cle in origine,
  };
}
