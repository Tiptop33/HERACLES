import { supabaseServer } from '../supabase-server';
import type { DonneesAffiche, Offre } from './affiche';
import type { DonneesAffichette } from './affichette';
import type { DonneesCompteRendu, DossierCompteRendu, LignePresence } from './compte-rendu';
import { COMMISSION_VIDE, type Commission } from './formats';
import type { DocumentCle, Reglages } from './gabarits';
import type { ImageDeposee } from './moteur';
import { nettoyer } from './reglages';

/**
 * Ce que les documents lisent en base — toujours sous la session de qui les
 * demande, donc sous la RLS et les portes des fonctions (migration 0067).
 *
 * Aucune clé de service ici : un document n'apprend rien que la personne
 * connectée ne puisse déjà voir.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les réglages et images déposées d'un document. */
export async function lireLaMiseEnPage(document: DocumentCle): Promise<{
  ecarts: Reglages;
  images: Map<string, ImageDeposee>;
}> {
  const supabase = await supabaseServer();
  const [{ data: reglages }, { data: images }] = await Promise.all([
    supabase.from('mise_en_page').select('reglages').eq('document', document).maybeSingle(),
    supabase.from('mise_en_page_image').select('cle, type, donnees').eq('document', document),
  ]);

  const deposees = new Map<string, ImageDeposee>();
  for (const i of (images as Array<{ cle: string; type: string; donnees: string }> | null) ?? []) {
    if (i.type !== 'image/png' && i.type !== 'image/jpeg') continue;
    deposees.set(i.cle, { type: i.type, octets: Buffer.from(i.donnees, 'base64') });
  }

  return {
    ecarts: nettoyer(document, (reglages as { reglages: unknown } | null)?.reglages),
    images: deposees,
  };
}

/** Le CV anonyme produit par HERACLES : validé ou non, par qui, et si c'est à moi (0073). */
export type EtatDuCvAnonyme = {
  valide_le: string | null;
  valide_par: string | null;
  peut_valider: boolean;
};

/**
 * L'état du CV anonyme d'un candidat que la session peut voir — même porte que
 * la fiche. `null` hors de ses loges.
 */
export async function lireLEtatDuCvAnonyme(candidat: string): Promise<EtatDuCvAnonyme | null> {
  if (!UUID.test(candidat)) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('etat_du_cv_anonyme', { candidat_choisi: candidat });
  if (error) {
    console.error('[cv-anonyme] état illisible', error.code);
    return null;
  }
  return (data as EtatDuCvAnonyme[] | null)?.[0] ?? null;
}

/**
 * L'adresse publique du CV anonyme. Sur l'adresse configurée du site, jamais
 * sur celle de la requête : l'affiche part chez des gens qui ne sont pas
 * derrière le même proxy (voir `origine()` dans `lib/formulaire.ts`).
 */
export function lienDuCvAnonyme(jeton: string | null | undefined, racine: string): string | null {
  if (!jeton || !UUID.test(jeton)) return null;
  return `${racine.replace(/\/+$/, '')}/cv-anonyme/${jeton}`;
}

type CommissionDeReunion = Commission & {
  lieu_reunions: string | null;
  nombre_dossiers: number | null;
  prochaine_reunion: string | null;
};

async function commissionDeLaReunion(reunion: string): Promise<CommissionDeReunion> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('commission_de_la_reunion', { reunion_choisie: reunion });
  const ligne = (data as CommissionDeReunion[] | null)?.[0];
  return ligne ?? { ...COMMISSION_VIDE, lieu_reunions: null, nombre_dossiers: null, prochaine_reunion: null };
}

async function offres(): Promise<Offre[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('offres_de_la_commission');
  return (data as Offre[] | null) ?? [];
}

type DossierEnCours = DossierCompteRendu & {
  candidat_id: string;
  cv_anonyme_jeton: string | null;
  type_emploi: string | null;
};

async function dossiers(reunion: string): Promise<DossierEnCours[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('dossiers_en_cours', { reunion_choisie: reunion });
  return ((data as Array<DossierEnCours & { recherche: string | null }> | null) ?? []).map((d) => ({
    ...d,
    emploi_recherche: d.recherche,
  }));
}

export async function donneesDuCompteRendu(reunion: { id: string; tenue_le: string }): Promise<DonneesCompteRendu> {
  const supabase = await supabaseServer();
  const [presences, candidats, commission, lesOffres] = await Promise.all([
    supabase.rpc('compte_rendu_presences', { reunion_choisie: reunion.id }).then(({ data }) => (data as LignePresence[] | null) ?? []),
    dossiers(reunion.id),
    commissionDeLaReunion(reunion.id),
    offres(),
  ]);
  return { tenueLe: reunion.tenue_le, presences, candidats, offres: lesOffres, commission };
}

export async function donneesDeLAffiche(reunion: { id: string; tenue_le: string }, racine: string): Promise<DonneesAffiche> {
  const [candidats, commission, lesOffres] = await Promise.all([
    dossiers(reunion.id),
    commissionDeLaReunion(reunion.id),
    offres(),
  ]);
  return {
    tenueLe: reunion.tenue_le,
    // Ce que l'affiche retient d'un dossier — et rien d'autre : ni nom, ni
    // commentaire. Le reste ne quitte pas cette fonction.
    dossiers: candidats.map((c) => ({
      numero: c.numero,
      ouvert_le: c.ouvert_le,
      intitule: c.emploi_recherche,
      lienCvAnonyme: lienDuCvAnonyme(c.cv_anonyme_jeton, racine),
    })),
    offres: lesOffres,
    commission,
  };
}

type FicheAffichette = {
  numero: number | null;
  type_emploi: string | null;
  emploi_recherche: string | null;
  metier_libelle: string | null;
  mobilite_geographique: string | null;
};

/**
 * Le contact par défaut du CV anonyme (0076) : l'adresse du Secrétaire de la
 * loge du candidat, sous la même porte que la fiche. `null` sans Secrétaire,
 * ou hors de ses loges.
 */
export async function lireLeContactDuCvAnonyme(candidat: string): Promise<string | null> {
  if (!UUID.test(candidat)) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('commission_du_candidat', { candidat_choisi: candidat });
  if (error) {
    console.error('[cv-anonyme] commission illisible', error.code);
    return null;
  }
  return (data as Array<{ secretaire_email: string | null }> | null)?.[0]?.secretaire_email?.trim() || null;
}

/**
 * L'adresse du Secrétaire de la loge de la personne connectée (0077) : ce que
 * le champ « Adresse de contact » du CV anonyme montre comme valeur
 * d'origine, et ce que son aperçu imprime. `null` sans Secrétaire.
 */
export async function lireLeSecretaireDeMaLoge(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('email_du_secretaire_de_ma_loge');
  if (error) {
    console.error('[cv-anonyme] Secrétaire de la loge illisible', error.code);
    return null;
  }
  return typeof data === 'string' && data.trim() ? data.trim() : null;
}

export async function donneesDeLAffichette(
  candidat: string,
  fiche: FicheAffichette,
  racine: string,
): Promise<DonneesAffichette> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('commission_du_candidat', { candidat_choisi: candidat });
  const ligne = (data as Array<Commission & { cv_anonyme_jeton: string | null }> | null)?.[0];
  return {
    numero: fiche.numero,
    type_emploi: fiche.type_emploi,
    emploi_recherche: fiche.emploi_recherche,
    metier_libelle: fiche.metier_libelle,
    mobilite_geographique: fiche.mobilite_geographique,
    commission: ligne ?? COMMISSION_VIDE,
    lienCvAnonyme: lienDuCvAnonyme(ligne?.cv_anonyme_jeton, racine),
  };
}
