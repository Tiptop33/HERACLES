/**
 * La réception des offres d'emploi depuis France Travail (migration 0099,
 * docs/france-travail.md) — l'API « Offres d'emploi v2 ».
 *
 * Ce module parle à France Travail et à personne d'autre : il obtient un
 * jeton, cherche les offres, et remet chaque page à qui les range (`deposer`).
 * Il ne connaît ni la base ni la clé de service — la route s'en charge. Tout
 * ce qui touche au réseau ou à l'horloge lui est passé, pour que les tests
 * l'éprouvent sans sortir de la machine.
 *
 * Ce qu'on envoie à France Travail : nos identifiants d'application, un
 * numéro de département, deux dates. Rien d'un candidat, rien d'un référent.
 *
 * Le découpage : par département, puis jour par jour, du plus récent au plus
 * ancien. L'API ne rend que les 3 150 premières réponses d'une recherche ; un
 * département entier sur un mois les dépasse, un département sur un jour, non.
 * Si un jour les dépassait quand même, on le compte (`plafonnees`) au lieu de
 * le taire.
 */

const ADRESSE_DU_JETON =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const ADRESSE_DE_RECHERCHE =
  'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const PORTEE = 'api_offresdemploiv2 o2dsoffre';

/** Une page de l'API : 150 offres au plus. */
export const TAILLE_DE_PAGE = 150;
/** Le dernier rang que l'API accepte de rendre pour une recherche. */
export const DERNIER_RANG = 3149;
/** Les départements de l'application Bubble : Gironde, Landes, Lot-et-Garonne, Pyrénées-Atlantiques. */
export const DEPARTEMENTS_PAR_DEFAUT = ['33', '40', '47', '64'];

export type Reglages = {
  clientId: string;
  clientSecret: string;
  departements: string[];
};

/**
 * Les réglages, lus dans l'environnement. `null` quand les identifiants
 * manquent : la réception n'est pas configurée, et la route le dit.
 */
export function lireReglages(env: Record<string, string | undefined>): Reglages | null {
  const clientId = env.FRANCE_TRAVAIL_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret) return null;

  const demandes = (env.FRANCE_TRAVAIL_DEPARTEMENTS ?? '')
    .split(',')
    .map((d) => d.trim().toUpperCase())
    .filter((d) => /^(?:[0-9]{2,3}|2[AB])$/.test(d));
  const departements = [...new Set(demandes)];

  return {
    clientId,
    clientSecret,
    departements: departements.length > 0 ? departements : DEPARTEMENTS_PAR_DEFAUT,
  };
}

/** Ce que la base répond quand on lui remet une page (0099). */
export type Compte = { recues: number; creees: number; mises_a_jour: number };

export type Outils = {
  fetch: typeof fetch;
  /** L'heure qu'il est, en millisecondes. */
  maintenant: () => number;
  /** Attendre, en millisecondes. */
  attendre: (ms: number) => Promise<void>;
  /** Range une page d'offres, telles que l'API les rend. */
  deposer: (offres: unknown[]) => Promise<Compte>;
};

/** Une panne de la réception, avec de quoi la lire dans un journal — jamais un secret. */
export class PanneFranceTravail extends Error {
  constructor(
    message: string,
    readonly etape: 'jeton' | 'recherche' | 'depot',
    readonly statut?: number,
  ) {
    super(message);
    this.name = 'PanneFranceTravail';
  }
}

/**
 * Demande un jeton d'accès. Il vaut environ vingt-cinq minutes. La portée est
 * celle de l'API visée : les offres par défaut, La Bonne Boîte pour les
 * entreprises qui recrutent (`la-bonne-boite.ts`).
 */
export async function obtenirJeton(
  reglages: Pick<Reglages, 'clientId' | 'clientSecret'>,
  outils: Pick<Outils, 'fetch'>,
  portee: string = PORTEE,
): Promise<string> {
  const reponse = await outils.fetch(ADRESSE_DU_JETON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: reglages.clientId,
      client_secret: reglages.clientSecret,
      scope: portee,
    }),
  });
  if (!reponse.ok) {
    throw new PanneFranceTravail(
      'France Travail a refusé les identifiants de l’application.',
      'jeton',
      reponse.status,
    );
  }
  const corps = (await reponse.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!corps || typeof corps.access_token !== 'string' || !corps.access_token) {
    throw new PanneFranceTravail('France Travail n’a pas rendu de jeton.', 'jeton', reponse.status);
  }
  return corps.access_token;
}

/** « 2026-11-23T00:00:00Z » : la forme que l'API attend, sans millisecondes. */
export function dateDeLApi(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Le total annoncé par l'en-tête `Content-Range` : « offres 0-149/1234 ». */
export function totalAnnonce(entete: string | null): number | null {
  const lu = /\/\s*(\d+)\s*$/.exec(entete ?? '');
  return lu ? Number(lu[1]) : null;
}

export type Fenetre = { departement: string; debut: Date; fin: Date };

/**
 * Les fenêtres à interroger : chaque département, jour par jour, du jour
 * courant en remontant. `jours` = 2 couvre aujourd'hui et hier.
 */
export function fenetres(departements: readonly string[], jours: number, maintenant: number): Fenetre[] {
  const UN_JOUR = 24 * 3600 * 1000;
  // Minuit UTC du jour courant : les fenêtres se touchent sans se recouvrir.
  const minuit = Math.floor(maintenant / UN_JOUR) * UN_JOUR;
  const liste: Fenetre[] = [];
  for (let j = 0; j < jours; j += 1) {
    const debut = new Date(minuit - j * UN_JOUR);
    // La première fenêtre va jusqu'à maintenant, les autres jusqu'à la dernière seconde du jour.
    const fin = j === 0 ? new Date(maintenant) : new Date(minuit - (j - 1) * UN_JOUR - 1000);
    for (const departement of departements) liste.push({ departement, debut, fin });
  }
  return liste;
}

type Page = { offres: unknown[]; total: number | null };

/** Une page d'une fenêtre. Patiente et réessaie quand l'API demande de ralentir. */
async function lirePage(jeton: string, fenetre: Fenetre, rang: number, outils: Outils): Promise<Page> {
  const adresse = new URL(ADRESSE_DE_RECHERCHE);
  adresse.searchParams.set('departement', fenetre.departement);
  adresse.searchParams.set('minCreationDate', dateDeLApi(fenetre.debut));
  adresse.searchParams.set('maxCreationDate', dateDeLApi(fenetre.fin));
  adresse.searchParams.set('range', `${rang}-${Math.min(rang + TAILLE_DE_PAGE - 1, DERNIER_RANG)}`);

  for (let essai = 0; ; essai += 1) {
    const reponse = await outils.fetch(adresse, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
    });

    // 204 : la recherche n'a rien trouvé. Ce n'est pas une panne.
    if (reponse.status === 204) return { offres: [], total: 0 };

    if (reponse.status === 429 && essai < 3) {
      const demande = Number(reponse.headers.get('retry-after'));
      await outils.attendre(Number.isFinite(demande) && demande > 0 ? Math.min(demande, 10) * 1000 : 1000);
      continue;
    }

    // 200 : tout est là. 206 : une partie, la suite est aux rangs suivants.
    if (reponse.status !== 200 && reponse.status !== 206) {
      throw new PanneFranceTravail(
        'France Travail n’a pas répondu à la recherche d’offres.',
        'recherche',
        reponse.status,
      );
    }

    const corps = (await reponse.json().catch(() => null)) as { resultats?: unknown } | null;
    const offres = Array.isArray(corps?.resultats) ? corps.resultats : [];
    return { offres, total: totalAnnonce(reponse.headers.get('content-range')) };
  }
}

export type Bilan = Compte & {
  /** Les appels de recherche faits à France Travail. */
  appels: number;
  /** Les fenêtres (un département, un jour) lues jusqu'au bout. */
  fenetres_lues: number;
  fenetres_prevues: number;
  /** Les fenêtres qui dépassaient ce que l'API accepte de rendre. */
  plafonnees: number;
  /** Faux si le temps imparti s'est écoulé avant la fin : relancer reprend. */
  termine: boolean;
};

/**
 * Reçoit les offres créées depuis `jours` jours dans les départements réglés.
 *
 * S'arrête proprement quand `budgetMs` est écoulé : ce qui est déposé reste
 * déposé. Le bilan dit alors combien de fenêtres sont lues ; l'appel suivant
 * les saute en passant ce nombre dans `reprise`, au lieu de refaire le même
 * début sans jamais atteindre la fin. Les jours les plus récents passent en
 * premier : une réception écourtée a quand même l'essentiel. Déposer deux fois
 * la même offre la met à jour, sans la doubler.
 */
export async function recevoirLesOffres(
  reglages: Reglages,
  jours: number,
  budgetMs: number,
  outils: Outils,
  reprise = 0,
): Promise<Bilan> {
  const depart = outils.maintenant();
  const aLire = fenetres(reglages.departements, jours, depart);
  const bilan: Bilan = {
    recues: 0,
    creees: 0,
    mises_a_jour: 0,
    appels: 0,
    fenetres_lues: Math.min(Math.max(reprise, 0), aLire.length),
    fenetres_prevues: aLire.length,
    plafonnees: 0,
    termine: false,
  };

  const jeton = await obtenirJeton(reglages, outils);

  for (const fenetre of aLire.slice(bilan.fenetres_lues)) {
    for (let rang = 0; rang <= DERNIER_RANG; rang += TAILLE_DE_PAGE) {
      if (outils.maintenant() - depart > budgetMs) return bilan;

      // L'API tolère une dizaine d'appels par seconde ; on reste loin dessous.
      if (bilan.appels > 0) await outils.attendre(150);
      const page = await lirePage(jeton, fenetre, rang, outils);
      bilan.appels += 1;

      if (page.offres.length > 0) {
        let compte: Compte;
        try {
          compte = await outils.deposer(page.offres);
        } catch {
          throw new PanneFranceTravail('Les offres reçues n’ont pas pu être rangées.', 'depot');
        }
        bilan.recues += compte.recues;
        bilan.creees += compte.creees;
        bilan.mises_a_jour += compte.mises_a_jour;
      }

      const dernier = rang + page.offres.length;
      if (page.total !== null && page.total > DERNIER_RANG + 1 && rang === 0) bilan.plafonnees += 1;
      // Fin de la fenêtre : page incomplète, ou total atteint.
      if (page.offres.length < TAILLE_DE_PAGE) break;
      if (page.total !== null && dernier >= page.total) break;
    }
    bilan.fenetres_lues += 1;
  }

  bilan.termine = true;
  return bilan;
}

/**
 * Combien de jours remonter : depuis la dernière offre connue, plus un jour de
 * recouvrement — deux au moins, trente et un au plus (au-delà, une offre n'est
 * plus « en cours » : la recevoir ne servirait à rien).
 */
export function joursARemonter(derniereOffre: Date | null, maintenant: number): number {
  if (!derniereOffre) return 31;
  const ecart = Math.ceil((maintenant - derniereOffre.getTime()) / (24 * 3600 * 1000));
  return Math.min(31, Math.max(2, ecart + 1));
}
