import { z } from 'zod';
import { PanneFranceTravail, obtenirJeton, type Reglages } from './france-travail';
import type { SecteurDuCandidat } from './secteurs';

/**
 * Les entreprises qui recrutent — l'API « La Bonne Boîte v2 » de France
 * Travail (docs/france-travail.md, « Les entreprises qui recrutent »).
 *
 * Sur la fiche d'un candidat, la liste des entreprises susceptibles de
 * recruter dans les six mois, dans ses secteurs et son département : de quoi
 * préparer une candidature spontanée ou une mise en relation par le parrain.
 *
 * Ce qu'on envoie à France Travail : des divisions NAF et un numéro de
 * département. Jamais un nom, une adresse, un identifiant de candidat : rien
 * qui permette de savoir pour qui l'on cherche.
 *
 * Rien n'est rangé en base : la liste est demandée à l'ouverture de la fiche,
 * gardée une heure en mémoire, puis oubliée.
 */

const ADRESSE_DE_RECHERCHE = 'https://api.francetravail.io/partenaire/labonneboite/v2/recherche';
/** La portée qu'exige l'API (spécification OpenAPI v2.27.3). */
export const PORTEE_LA_BONNE_BOITE = 'api_labonneboitev2 search office';
/** Combien d'entreprises la fiche montre. */
export const ENTREPRISES_PAR_FICHE = 10;
/** Au-delà, la requête devient longue pour un gain nul : la liste est triée par potentiel. */
const DIVISIONS_AU_PLUS = 40;

/**
 * Les divisions de chaque section de la NAF rév. 2 (INSEE, 2008) — la
 * nomenclature de HERACLES (0086) et celle de l'API. Un candidat peut
 * s'arrêter à la section (0088) ; l'API, elle, attend des divisions.
 */
const DIVISIONS_PAR_SECTION: Record<string, readonly [number, number][]> = {
  A: [[1, 3]],
  B: [[5, 9]],
  C: [[10, 33]],
  D: [[35, 35]],
  E: [[36, 39]],
  F: [[41, 43]],
  G: [[45, 47]],
  H: [[49, 53]],
  I: [[55, 56]],
  J: [[58, 63]],
  K: [[64, 66]],
  L: [[68, 68]],
  M: [[69, 75]],
  N: [[77, 82]],
  O: [[84, 84]],
  P: [[85, 85]],
  Q: [[86, 88]],
  R: [[90, 93]],
  S: [[94, 96]],
  T: [[97, 98]],
  U: [[99, 99]],
};

/** Les divisions d'une section, « 41 », « 42 », « 43 » pour F. Vide pour une lettre inconnue. */
export function divisionsDeLaSection(section: string): string[] {
  const plages = DIVISIONS_PAR_SECTION[section.toUpperCase()] ?? [];
  const divisions: string[] = [];
  for (const [debut, fin] of plages) {
    for (let d = debut; d <= fin; d += 1) divisions.push(String(d).padStart(2, '0'));
  }
  return divisions;
}

/**
 * Les divisions à chercher pour un candidat, dans l'ordre de ses secteurs :
 * une division telle quelle, une section dépliée en ses divisions. Sans
 * doublon, et pas plus de quarante.
 */
export function divisionsDuCandidat(secteurs: readonly Pick<SecteurDuCandidat, 'rang' | 'code' | 'niveau'>[]): string[] {
  const retenues: string[] = [];
  for (const s of [...secteurs].sort((a, b) => a.rang - b.rang)) {
    const divisions =
      s.niveau === 'division' && /^\d{2}$/.test(s.code) ? [s.code] : s.niveau === 'section' ? divisionsDeLaSection(s.code) : [];
    for (const d of divisions) if (!retenues.includes(d)) retenues.push(d);
  }
  return retenues.slice(0, DIVISIONS_AU_PLUS);
}

/**
 * Le département d'un code postal : « 33 », « 2A », « 974 ». `null` quand le
 * code n'en désigne pas un (vide, étranger, Monaco).
 */
export function departementDuCodePostal(codePostal: string | null | undefined): string | null {
  const cp = (codePostal ?? '').replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith('20')) return Number(cp) < 20200 ? '2A' : '2B';
  if (cp.startsWith('97')) return /^97[1-6]/.test(cp) ? cp.slice(0, 3) : null;
  if (cp.startsWith('98') || cp === '00000') return null;
  return cp.slice(0, 2);
}

/** Une entreprise, telle que la fiche l'affiche. */
export type EntrepriseQuiRecrute = {
  siret: string;
  nom: string;
  ville: string | null;
  code_postal: string | null;
  effectif_min: number | null;
  effectif_max: number | null;
  activite: string | null;
  /** Le potentiel d'embauche, de 0 à 100. */
  potentiel: number | null;
  fort_potentiel: boolean;
};

/** « 10 à 19 salariés », « 250 salariés et plus », ou rien. */
export function effectif(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return min === max ? `${min} salariés` : `${min} à ${max} salariés`;
  if (min !== null) return `${min} salariés et plus`;
  if (max !== null) return `jusqu’à ${max} salariés`;
  return null;
}

/**
 * « potentiel 88/100 » — le potentiel d'embauche que France Travail donne à
 * l'entreprise, arrondi, affiché à droite de sa ligne. `null` s'il manque ou
 * sort de 0 à 100 : pas de chiffre plutôt qu'un chiffre faux.
 */
export function potentielAffiche(potentiel: number | null): string | null {
  if (potentiel === null || !Number.isFinite(potentiel) || potentiel < 0 || potentiel > 100) return null;
  return `potentiel ${Math.round(potentiel)}/100`;
}

export type ResultatLaBonneBoite = {
  /** Combien d'entreprises correspondent en tout. */
  total: number;
  entreprises: EntrepriseQuiRecrute[];
};

const Nombre = z.preprocess((v) => (v === '' || v === null ? null : Number(v)), z.number().finite().nullable()).catch(null);
const Texte = z.string().trim().min(1).nullable().optional().catch(null);

const Article = z.object({
  siret: z.string().regex(/^\d{14}$/),
  company_name: Texte,
  office_name: Texte,
  city: Texte,
  postcode: Texte,
  headcount_min: Nombre.optional(),
  headcount_max: Nombre.optional(),
  naf_label: Texte,
  hiring_potential: Nombre.optional(),
  is_high_potential: z.boolean().optional().catch(false),
});

const Reponse = z.object({
  hits: z.number().int().nonnegative().optional().catch(undefined),
  items: z.array(z.unknown()).catch([]),
});

/**
 * Lit la réponse de `/recherche`. Une entreprise illisible est écartée, pas
 * la page entière : une donnée manquante chez France Travail ne doit pas
 * vider la liste.
 */
export function lireLaReponse(json: unknown): ResultatLaBonneBoite {
  const lue = Reponse.safeParse(json);
  if (!lue.success) return { total: 0, entreprises: [] };

  const entreprises: EntrepriseQuiRecrute[] = [];
  for (const brut of lue.data.items) {
    const a = Article.safeParse(brut);
    if (!a.success) continue;
    const nom = a.data.office_name ?? a.data.company_name;
    if (!nom) continue;
    entreprises.push({
      siret: a.data.siret,
      nom,
      ville: a.data.city ?? null,
      code_postal: a.data.postcode ?? null,
      effectif_min: a.data.headcount_min ?? null,
      effectif_max: a.data.headcount_max ?? null,
      activite: a.data.naf_label ?? null,
      potentiel: a.data.hiring_potential ?? null,
      fort_potentiel: a.data.is_high_potential === true,
    });
  }
  return { total: lue.data.hits ?? entreprises.length, entreprises };
}

export type Recherche = { divisions: string[]; departement: string };

/** La clé d'une recherche, pour la mémoire : l'ordre des divisions compte, il fait le tri. */
export function cleDeLaRecherche(r: Recherche): string {
  return `${r.departement}|${r.divisions.join(',')}`;
}

/** L'adresse de `/recherche` : les tableaux se répètent (`naf=41&naf=43`). */
export function adresseDeRecherche(r: Recherche): URL {
  const adresse = new URL(ADRESSE_DE_RECHERCHE);
  for (const d of r.divisions) adresse.searchParams.append('naf', d);
  adresse.searchParams.append('department_number', r.departement);
  adresse.searchParams.set('sort_by', 'hiring_potential');
  adresse.searchParams.set('sort_direction', 'desc');
  adresse.searchParams.set('page', '1');
  adresse.searchParams.set('page_size', String(ENTREPRISES_PAR_FICHE));
  return adresse;
}

export type OutilsLaBonneBoite = {
  fetch: typeof fetch;
  attendre: (ms: number) => Promise<void>;
};

/**
 * Demande la liste à France Travail. L'API admet deux appels par seconde :
 * à la demande de ralentir (429), on patiente une fois, puis on renonce.
 */
export async function chercherLesEntreprises(
  jeton: string,
  recherche: Recherche,
  outils: OutilsLaBonneBoite,
): Promise<ResultatLaBonneBoite> {
  if (recherche.divisions.length === 0) return { total: 0, entreprises: [] };
  const adresse = adresseDeRecherche(recherche);

  for (let essai = 0; ; essai += 1) {
    const reponse = await outils.fetch(adresse, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
    });
    if (reponse.status === 204 || reponse.status === 404) return { total: 0, entreprises: [] };
    if (reponse.status === 429 && essai < 1) {
      await outils.attendre(1000);
      continue;
    }
    if (!reponse.ok) {
      throw new PanneFranceTravail('La Bonne Boîte n’a pas répondu.', 'recherche', reponse.status);
    }
    return lireLaReponse(await reponse.json().catch(() => null));
  }
}

/**
 * Le service, avec sa mémoire : le jeton vingt minutes, chaque liste une
 * heure. Deux fiches du même secteur et du même département ne coûtent qu'un
 * appel ; une fiche rouverte n'en coûte aucun.
 */
export function serviceLaBonneBoite(
  reglages: Reglages,
  outils: OutilsLaBonneBoite & { maintenant: () => number },
) {
  const UNE_HEURE = 3600 * 1000;
  const VINGT_MINUTES = 20 * 60 * 1000;
  let jeton: { valeur: string; expire: number } | null = null;
  const listes = new Map<string, { resultat: ResultatLaBonneBoite; expire: number }>();

  return async function chercher(recherche: Recherche): Promise<ResultatLaBonneBoite> {
    const maintenant = outils.maintenant();
    const cle = cleDeLaRecherche(recherche);
    const gardee = listes.get(cle);
    if (gardee && gardee.expire > maintenant) return gardee.resultat;

    if (!jeton || jeton.expire <= maintenant) {
      jeton = { valeur: await obtenirJeton(reglages, outils, PORTEE_LA_BONNE_BOITE), expire: maintenant + VINGT_MINUTES };
    }
    let resultat: ResultatLaBonneBoite;
    try {
      resultat = await chercherLesEntreprises(jeton.valeur, recherche, outils);
    } catch (panne) {
      // Un jeton refusé (401) ne se garde pas : le prochain appel en redemande un.
      if (panne instanceof PanneFranceTravail && panne.statut === 401) jeton = null;
      throw panne;
    }

    // La mémoire ne grossit pas sans fin : on oublie d'abord ce qui a expiré.
    if (listes.size >= 500) {
      for (const [k, v] of listes) if (v.expire <= maintenant) listes.delete(k);
      if (listes.size >= 500) listes.clear();
    }
    listes.set(cle, { resultat, expire: maintenant + UNE_HEURE });
    return resultat;
  };
}
