import { z } from 'zod';
import { PanneFranceTravail, obtenirJeton } from './france-travail';

/**
 * Les offres en alternance — l'API « Recherche d'opportunités d'emploi en
 * alternance » de La bonne alternance (Mission interministérielle de
 * l'apprentissage), docs/france-travail.md, « Les offres en alternance ».
 *
 * Sur la fiche d'un candidat qui cherche une alternance, les offres autour de
 * chez lui, pour son métier. Trois étapes, chacune gardée en mémoire :
 *
 *   1. le métier écrit sur la fiche → un code ROME, par ROMEO (France Travail) ;
 *   2. le code postal → le centre de la commune (API apprentissage) ;
 *   3. codes ROME + position + rayon → les offres (API apprentissage).
 *
 * Ce qui part : l'intitulé du métier chez France Travail ; un code postal, des
 * codes ROME et une position (le centre de la commune, pas l'adresse) chez la
 * Mission apprentissage. Jamais un nom, ni un identifiant de candidat.
 *
 * Rien n'est rangé en base. Le téléphone du recruteur, que l'API rend
 * parfois, n'est pas repris : la fiche mène à l'offre, où il figure.
 */

const ADRESSE_ROMEO = 'https://api.francetravail.io/partenaire/romeo/v2/predictionMetiers';
/** La portée qu'exige ROMEO (spécification v2.0). */
export const PORTEE_ROMEO = 'api_romeov2';
const ADRESSE_APPRENTISSAGE = 'https://api.apprentissage.beta.gouv.fr/api';

/** Le rayon de recherche autour de la commune, en kilomètres (30 : la valeur par défaut de l'API). */
export const RAYON_KM = 30;
/** Combien d'offres la fiche montre. */
export const OFFRES_PAR_FICHE = 10;

/** Le candidat cherche-t-il une alternance ? « stage en alternance » dans la liste de Bubble. */
export function estEnAlternance(typeEmploi: string | null | undefined): boolean {
  return Boolean(typeEmploi && /altern/i.test(typeEmploi));
}

/** Le métier à envoyer à ROMEO : court, sans retour à la ligne. `null` s'il n'y en a pas. */
export function metierAPredire(...textes: (string | null | undefined)[]): string | null {
  for (const t of textes) {
    const propre = (t ?? '').replace(/\s+/g, ' ').trim();
    if (propre.length >= 2) return propre.slice(0, 120);
  }
  return null;
}

// --- 1. ROMEO : le métier en codes ROME -------------------------------------

const CODE_ROME = /^[A-N]\d{4}$/;

const PredictionRomeo = z.array(
  z.object({
    metiersRome: z
      .array(
        z.object({ codeRome: z.string(), libelleRome: z.string().trim().optional().catch(undefined) }).passthrough(),
      )
      .catch([]),
  }).passthrough(),
);

/** Le métier du ROME retenu pour la recherche : son code, et son intitulé pour l'écran. */
export type MetierRome = { code: string; libelle: string | null };

/**
 * Le métier tiré d'une réponse de ROMEO : la prédiction la plus probable, et
 * elle seule (décision du 24 novembre 2026 — plusieurs métiers ramenaient des
 * offres hors sujet). `null` si ROMEO n'en propose aucun de lisible.
 */
export function lireLeMetier(json: unknown): MetierRome | null {
  const lu = PredictionRomeo.safeParse(json);
  if (!lu.success || lu.data.length === 0) return null;
  const premier = lu.data[0].metiersRome.find((m) => CODE_ROME.test(m.codeRome.trim().toUpperCase()));
  if (!premier) return null;
  return { code: premier.codeRome.trim().toUpperCase(), libelle: premier.libelleRome || null };
}

export type Outils = {
  fetch: typeof fetch;
  attendre: (ms: number) => Promise<void>;
};

/** Un appel, avec une seconde chance quand le service demande de ralentir (429). */
async function appeler(adresse: URL | string, init: RequestInit, outils: Outils): Promise<Response> {
  for (let essai = 0; ; essai += 1) {
    const reponse = await outils.fetch(adresse, init);
    if (reponse.status !== 429 || essai >= 1) return reponse;
    const demande = Number(reponse.headers.get('retry-after'));
    await outils.attendre(Number.isFinite(demande) && demande > 0 ? Math.min(demande, 5) * 1000 : 1000);
  }
}

export async function predireLeMetier(jeton: string, metier: string, outils: Outils): Promise<MetierRome | null> {
  const reponse = await appeler(
    ADRESSE_ROMEO,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        appellations: [{ intitule: metier, identifiant: '1' }],
        options: { nomAppelant: 'heracles', nbResultats: 1 },
      }),
    },
    outils,
  );
  if (!reponse.ok) throw new PanneFranceTravail('ROMEO n’a pas répondu.', 'recherche', reponse.status);
  return lireLeMetier(await reponse.json().catch(() => null));
}

// --- 2. La commune : son centre ---------------------------------------------

export type Position = { latitude: number; longitude: number };

const Communes = z.array(
  z.object({
    nom: z.string().catch(''),
    localisation: z.object({
      centre: z.object({ coordinates: z.tuple([z.number(), z.number()]).rest(z.number()) }),
    }),
  }).passthrough(),
);

/** « Saint-Médard-en-Jalles » et « ST MEDARD EN JALLES » se reconnaissent. */
function normaliser(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Le centre de la commune, parmi celles du code postal : celle dont le nom
 * est la ville de la fiche, sinon la première. GeoJSON range la longitude
 * d'abord.
 */
export function lireLaPosition(json: unknown, ville: string | null | undefined): Position | null {
  const lu = Communes.safeParse(json);
  if (!lu.success) return null;
  const voulue = ville ? normaliser(ville) : '';
  const commune = (voulue && lu.data.find((c) => normaliser(c.nom) === voulue)) || lu.data[0];
  if (!commune) return null;
  const [longitude, latitude] = commune.localisation.centre.coordinates;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Un code postal français à cinq chiffres, ou `null`. */
export function codePostalValide(codePostal: string | null | undefined): string | null {
  const cp = (codePostal ?? '').replace(/\s/g, '');
  return /^\d{5}$/.test(cp) ? cp : null;
}

export async function localiser(
  cle: string,
  codePostal: string,
  ville: string | null,
  outils: Outils,
): Promise<Position | null> {
  const adresse = new URL(`${ADRESSE_APPRENTISSAGE}/geographie/v1/commune/search`);
  adresse.searchParams.set('code', codePostal);
  const reponse = await appeler(adresse, { headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' } }, outils);
  if (reponse.status === 404) return null;
  if (!reponse.ok) throw new PanneFranceTravail('L’API apprentissage n’a pas trouvé la commune.', 'recherche', reponse.status);
  return lireLaPosition(await reponse.json().catch(() => null), ville);
}

// --- 3. Les offres ----------------------------------------------------------

/** Une offre, telle que la fiche l'affiche. */
export type OffreEnAlternance = {
  id: string;
  titre: string;
  entreprise: string | null;
  adresse: string | null;
  contrats: string[];
  debut: string | null;
  duree_mois: number | null;
  lien: string | null;
  /** La date de parution de l'offre (`offer.publication.creation`), ou `null`. */
  parue_le: string | null;
};

export type ResultatAlternance = {
  /** Combien d'offres l'API a rendues (150 au plus par source). */
  total: number;
  offres: OffreEnAlternance[];
};

const TexteFacultatif = z.string().trim().min(1).nullable().optional().catch(null);

const Offre = z.object({
  identifier: z.object({ id: TexteFacultatif, partner_job_id: TexteFacultatif }).passthrough(),
  workplace: z
    .object({
      name: TexteFacultatif,
      brand: TexteFacultatif,
      legal_name: TexteFacultatif,
      location: z.object({ address: TexteFacultatif }).passthrough().nullable().optional().catch(null),
    })
    .passthrough()
    .catch({}),
  apply: z.object({ url: TexteFacultatif }).passthrough().nullable().optional().catch(null),
  contract: z
    .object({
      start: TexteFacultatif,
      duration: z.number().int().positive().nullable().optional().catch(null),
      type: z.array(z.string()).optional().catch([]),
    })
    .passthrough()
    .nullable()
    .optional()
    .catch(null),
  offer: z
    .object({
      title: z.string().trim().min(1),
      publication: z.object({ creation: TexteFacultatif }).passthrough().nullable().optional().catch(null),
    })
    .passthrough(),
});

const ReponseRecherche = z.object({ jobs: z.array(z.unknown()).catch([]) }).passthrough();

/** Seules les adresses web sont gardées pour le lien : rien d'autre ne s'ouvre depuis la fiche. */
function lienSur(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Lit la réponse de `/job/v1/search`. Une offre illisible est écartée, pas la liste. */
export function lireLesOffres(json: unknown): ResultatAlternance {
  const lu = ReponseRecherche.safeParse(json);
  if (!lu.success) return { total: 0, offres: [] };

  const offres: OffreEnAlternance[] = [];
  for (const brut of lu.data.jobs) {
    const o = Offre.safeParse(brut);
    if (!o.success) continue;
    const id = o.data.identifier.id ?? o.data.identifier.partner_job_id;
    if (!id || offres.some((x) => x.id === id)) continue;
    const debut = o.data.contract?.start ?? null;
    const parue = o.data.offer.publication?.creation ?? null;
    offres.push({
      id,
      titre: o.data.offer.title,
      entreprise: o.data.workplace.name ?? o.data.workplace.brand ?? o.data.workplace.legal_name ?? null,
      adresse: o.data.workplace.location?.address ?? null,
      contrats: o.data.contract?.type ?? [],
      debut: debut && !Number.isNaN(Date.parse(debut)) ? debut : null,
      duree_mois: o.data.contract?.duration ?? null,
      lien: lienSur(o.data.apply?.url),
      parue_le: parue && !Number.isNaN(Date.parse(parue)) ? parue : null,
    });
  }
  return { total: offres.length, offres: offres.slice(0, OFFRES_PAR_FICHE) };
}

export type Recherche = { romes: string[]; position: Position };

export function adresseDeRecherche(r: Recherche): URL {
  const adresse = new URL(`${ADRESSE_APPRENTISSAGE}/job/v1/search`);
  adresse.searchParams.set('romes', r.romes.join(','));
  // Quatre décimales : une centaine de mètres, bien assez pour un rayon de 30 km.
  adresse.searchParams.set('latitude', r.position.latitude.toFixed(4));
  adresse.searchParams.set('longitude', r.position.longitude.toFixed(4));
  adresse.searchParams.set('radius', String(RAYON_KM));
  return adresse;
}

export async function chercherLesOffres(cle: string, recherche: Recherche, outils: Outils): Promise<ResultatAlternance> {
  if (recherche.romes.length === 0) return { total: 0, offres: [] };
  const reponse = await appeler(
    adresseDeRecherche(recherche),
    { headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' } },
    outils,
  );
  if (!reponse.ok) throw new PanneFranceTravail('La bonne alternance n’a pas répondu.', 'recherche', reponse.status);
  return lireLesOffres(await reponse.json().catch(() => null));
}

// --- Le service, avec sa mémoire --------------------------------------------

export type ReglagesAlternance = {
  /** Les identifiants France Travail, pour ROMEO. */
  clientId: string;
  clientSecret: string;
  /** La clé de l'API apprentissage. */
  cle: string;
};

/** La clé de l'API apprentissage, et les identifiants France Travail ; `null` s'il en manque. */
export function lireReglagesAlternance(env: Record<string, string | undefined>): ReglagesAlternance | null {
  const clientId = env.FRANCE_TRAVAIL_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim() ?? '';
  const cle = env.LA_BONNE_ALTERNANCE_CLE?.trim() ?? '';
  if (!clientId || !clientSecret || !cle) return null;
  return { clientId, clientSecret, cle };
}

export type Demande = { metier: string; codePostal: string; ville: string | null };

export type Reponse =
  | { etat: 'ok'; metier: MetierRome; resultat: ResultatAlternance }
  | { etat: 'metier-inconnu' }
  | { etat: 'commune-inconnue' };

/** Une petite mémoire à durée de vie, qui ne grossit pas sans fin. */
function memoire<T>(dureeMs: number, maintenant: () => number) {
  const lignes = new Map<string, { valeur: T; expire: number }>();
  return {
    lire(cle: string): T | undefined {
      const l = lignes.get(cle);
      return l && l.expire > maintenant() ? l.valeur : undefined;
    },
    ecrire(cle: string, valeur: T) {
      if (lignes.size >= 500) {
        for (const [k, v] of lignes) if (v.expire <= maintenant()) lignes.delete(k);
        if (lignes.size >= 500) lignes.clear();
      }
      lignes.set(cle, { valeur, expire: maintenant() + dureeMs });
    },
  };
}

/**
 * Le service : le jeton ROMEO vingt minutes, le code ROME d'un métier et la
 * position d'une commune un jour, chaque liste d'offres une heure.
 */
export function serviceLaBonneAlternance(reglages: ReglagesAlternance, outils: Outils & { maintenant: () => number }) {
  const UNE_HEURE = 3600 * 1000;
  let jeton: { valeur: string; expire: number } | null = null;
  const metiers = memoire<MetierRome | null>(24 * UNE_HEURE, outils.maintenant);
  const positions = memoire<Position | null>(24 * UNE_HEURE, outils.maintenant);
  const listes = memoire<ResultatAlternance>(UNE_HEURE, outils.maintenant);

  async function metierRome(metier: string): Promise<MetierRome | null> {
    const cle = normaliser(metier);
    const garde = metiers.lire(cle);
    if (garde !== undefined) return garde;
    if (!jeton || jeton.expire <= outils.maintenant()) {
      jeton = { valeur: await obtenirJeton(reglages, outils, PORTEE_ROMEO), expire: outils.maintenant() + 20 * 60 * 1000 };
    }
    try {
      const trouve = await predireLeMetier(jeton.valeur, metier, outils);
      metiers.ecrire(cle, trouve);
      return trouve;
    } catch (panne) {
      if (panne instanceof PanneFranceTravail && panne.statut === 401) jeton = null;
      throw panne;
    }
  }

  async function position(codePostal: string, ville: string | null): Promise<Position | null> {
    const cle = `${codePostal}|${normaliser(ville ?? '')}`;
    const gardee = positions.lire(cle);
    if (gardee !== undefined) return gardee;
    const trouvee = await localiser(reglages.cle, codePostal, ville, outils);
    positions.ecrire(cle, trouvee);
    return trouvee;
  }

  return async function chercher(demande: Demande): Promise<Reponse> {
    const [rome, lieu] = await Promise.all([metierRome(demande.metier), position(demande.codePostal, demande.ville)]);
    if (!rome) return { etat: 'metier-inconnu' };
    if (!lieu) return { etat: 'commune-inconnue' };

    const recherche = { romes: [rome.code], position: lieu };
    const cle = adresseDeRecherche(recherche).search;
    let resultat = listes.lire(cle);
    if (!resultat) {
      resultat = await chercherLesOffres(reglages.cle, recherche, outils);
      listes.ecrire(cle, resultat);
    }
    return { etat: 'ok', metier: rome, resultat };
  };
}
