import { z } from 'zod';
import { substituer } from './documents/balisage';
import { lireListe, type ListeDeLaLoge } from './secteurs';

/**
 * Les loges du réseau — les 73 loges extérieures à l'application, à ne pas
 * confondre avec ses « loges » (vocabulaire du CLAUDE.md). Leur Secrétaire
 * coche les secteurs d'activité de sa loge par un lien personnel, valable
 * 90 jours ; l'administration les saisit et envoie les liens depuis
 * Paramètres › Loges du réseau (migrations 0089 et 0091,
 * docs/secteurs-d-activite.md, décisions 17 à 30).
 *
 * Ce module est pur : il sert au serveur comme au navigateur. La lecture en
 * base est dans `loges-du-reseau-serveur.ts`.
 */

/** Durée de validité d'un lien, en jours (décision 22). Elle est aussi écrite en base (0091). */
export const DUREE_DU_LIEN_JOURS = 90;

// --- La page du Secrétaire --------------------------------------------------

/** Ce que la page du Secrétaire affiche, quand son lien vaut. */
export type PageDeLaLogeDuReseau = {
  etat: 'valable';
  nom: string;
  numero: string | null;
  province: string | null;
  secretaire_nom: string | null;
  a_un_ecusson: boolean;
  expire_le: string;
  liste: ListeDeLaLoge;
};

/** Ce que la base répond pour un lien : la page, « expiré », ou rien. */
export type ReponseDuLien = PageDeLaLogeDuReseau | { etat: 'expire' } | null;

const Page = z.object({
  etat: z.literal('valable'),
  nom: z.string(),
  numero: z.string().nullable(),
  province: z.string().nullable(),
  secretaire_nom: z.string().nullable(),
  a_un_ecusson: z.boolean(),
  expire_le: z.string(),
  liste: z.unknown(),
});

/** La réponse de `page_de_la_loge_du_reseau`, vérifiée. Une forme inattendue vaut un lien expiré. */
export function lirePage(valeur: unknown): ReponseDuLien {
  if (valeur === null || valeur === undefined) return null;
  const lu = Page.safeParse(valeur);
  if (!lu.success) return { etat: 'expire' };
  const liste = lireListe(lu.data.liste);
  if (!liste) return { etat: 'expire' };
  return { ...lu.data, liste };
}

/** L'adresse de la page d'un lien. */
export function lienDeLaLogeDuReseau(origine: string, jeton: string): string {
  return `${origine.replace(/\/+$/, '')}/loge-du-reseau/${jeton}`;
}

/** « 11 février 2027 », à l'heure de Paris. */
export function dateEnLettres(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

/**
 * La lettre qui tient la place de l'écusson tant qu'il n'est pas déposé —
 * comme l'initiale d'une province sans image. Le mot « Loge » et l'article
 * qui ouvre le nom sont sautés : « Les Bâtisseurs » donne B, pas L.
 */
export function initialeDeLoge(nom: string | null | undefined): string {
  const propre = (nom ?? '')
    .trim()
    .replace(/^loge\s+/i, '')
    .replace(/^(?:(?:les|le|la)\s+|l['’]\s*)/i, '')
    .trim();
  const premiere = propre.match(/\p{L}|\p{N}/u)?.[0];
  return premiere ? premiere.toLocaleUpperCase('fr') : '?';
}

/** Un écusson se dépose en image : JPEG, PNG, WebP, GIF ou AVIF, 5 Mo au plus. */
export const TAILLE_MAXIMALE_ECUSSON = 5 * 1024 * 1024;

// --- L'administration -----------------------------------------------------

/** Une loge du réseau, telle que la rubrique de Paramètres la reçoit. */
export type LogeDuReseau = {
  id: string;
  nom: string;
  numero: string | null;
  province_id: string | null;
  province: string | null;
  secretaire_nom: string | null;
  secretaire_email: string | null;
  a_un_ecusson: boolean;
  lien_envoye_le: string | null;
  lien_expire_le: string | null;
  secteurs_maj_le: string | null;
  secteurs: { code: string; intitule: string }[];
};

const Loge = z.object({
  id: z.string(),
  nom: z.string(),
  numero: z.string().nullable(),
  province_id: z.string().nullable(),
  province: z.string().nullable(),
  secretaire_nom: z.string().nullable(),
  secretaire_email: z.string().nullable(),
  a_un_ecusson: z.boolean(),
  lien_envoye_le: z.string().nullable(),
  lien_expire_le: z.string().nullable(),
  secteurs_maj_le: z.string().nullable(),
  secteurs: z.array(z.object({ code: z.string(), intitule: z.string() })),
});

/** La réponse de `lister_loges_du_reseau`, vérifiée ; les lignes mal formées sont écartées. */
export function lireLoges(valeur: unknown): LogeDuReseau[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.flatMap((v) => {
    const lu = Loge.safeParse(v);
    return lu.success ? [lu.data] : [];
  });
}

/** Où en est une loge du réseau. */
export type EtatDeLaLoge = 'sans' | 'envoye' | 'expire' | 'repondu';

/**
 * L'état d'une loge, dans l'ordre où il compte : une loge qui a coché au
 * moins un secteur « a répondu » (décision 26), même si son lien a depuis
 * expiré ; sinon, son lien dit le reste.
 */
export function etatDeLaLoge(loge: LogeDuReseau, maintenant: Date = new Date()): EtatDeLaLoge {
  if (loge.secteurs.length > 0) return 'repondu';
  if (!loge.lien_envoye_le) return 'sans';
  if (loge.lien_expire_le && new Date(loge.lien_expire_le).getTime() <= maintenant.getTime()) return 'expire';
  return 'envoye';
}

/** Le libellé de l'état, tel que la maquette validée l'écrit. */
export function libelleDeLEtat(loge: LogeDuReseau, maintenant: Date = new Date()): string {
  switch (etatDeLaLoge(loge, maintenant)) {
    case 'repondu': {
      const n = loge.secteurs.length;
      return `A répondu · ${n} secteur${n > 1 ? 's' : ''}`;
    }
    case 'sans':
      return 'Pas encore de lien';
    case 'expire':
      return 'Lien expiré, sans réponse';
    case 'envoye': {
      const jour = new Date(loge.lien_envoye_le as string).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Europe/Paris',
      });
      return `Lien envoyé le ${jour}, sans réponse`;
    }
  }
}

/** Les compteurs en tête de la rubrique. */
export function compter(loges: LogeDuReseau[], maintenant: Date = new Date()) {
  const n: Record<EtatDeLaLoge, number> = { sans: 0, envoye: 0, expire: 0, repondu: 0 };
  for (const l of loges) n[etatDeLaLoge(l, maintenant)] += 1;
  return { total: loges.length, ...n };
}

/** Les loges à qui l'envoi groupé écrira : jamais de lien, et une adresse. */
export function aEnvoyerEnGroupe(loges: LogeDuReseau[]): LogeDuReseau[] {
  return loges.filter((l) => !l.lien_envoye_le && Boolean(l.secretaire_email));
}

/** Le libellé du bouton d'envoi groupé. */
export function libelleDeLEnvoiGroupe(n: number): string {
  if (n === 0) return 'Toutes les loges ont reçu leur lien';
  if (n === 1) return 'Envoyer le lien à la loge qui ne l’a pas reçu';
  return `Envoyer le lien aux ${n} loges qui ne l’ont pas reçu`;
}

const sansAccent = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Le filtre et la recherche de la rubrique. */
export function filtrerLoges(
  loges: LogeDuReseau[],
  filtre: 'toutes' | EtatDeLaLoge,
  recherche: string,
  maintenant: Date = new Date(),
): LogeDuReseau[] {
  const q = sansAccent(recherche.trim());
  return loges.filter(
    (l) =>
      (filtre === 'toutes' || etatDeLaLoge(l, maintenant) === filtre) &&
      (!q ||
        sansAccent(
          [l.nom, l.numero, l.secretaire_nom, l.secretaire_email].filter(Boolean).join(' '),
        ).includes(q)),
  );
}

// --- Le courriel ----------------------------------------------------------

export type ModeleDuCourriel = { objet: string; texte: string };

/** Le nom de la loge tel que le courriel l'écrit : « L'Essai (n° 512) ». */
export function nomDansLeCourriel(loge: Pick<LogeDuReseau, 'nom' | 'numero'>): string {
  return loge.numero ? `${loge.nom} (n° ${loge.numero})` : loge.nom;
}

/**
 * Le courriel d'une loge, variables remplacées : {secretaire}, {loge},
 * {lien}, {expiration}. Une variable inconnue reste écrite telle quelle — elle
 * se voit dans l'aperçu (`substituer`).
 */
export function composerLeCourriel(
  modele: ModeleDuCourriel,
  valeurs: { secretaire: string | null; loge: string; lien: string; expiration: string },
): { sujet: string; texte: string } {
  const variables = {
    secretaire: valeurs.secretaire?.trim() || 'Madame, Monsieur',
    loge: valeurs.loge,
    lien: valeurs.lien,
    expiration: valeurs.expiration,
  };
  return { sujet: substituer(modele.objet, variables).trim(), texte: substituer(modele.texte, variables) };
}
